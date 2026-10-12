"""Bounded, read-only public GitHub intake. Never clone or execute repository code."""
import json
import re
from datetime import datetime, timezone
from time import monotonic
from urllib.parse import quote, urlsplit

import httpx
from fastapi import HTTPException

MAX_RESPONSE_BYTES = 2_000_000
MAX_DIFF_CHARS = 20_000
MAX_FILES = 30


def repository_name(value):
    try:
        url = urlsplit(value.strip())
    except ValueError:
        raise HTTPException(422, 'Use an HTTPS github.com/owner/repository URL')
    match = re.fullmatch(r'/([A-Za-z0-9-]{1,39})/([A-Za-z0-9_.-]{1,100})/?', url.path)
    if url.scheme != 'https' or url.netloc != 'github.com' or url.query or url.fragment or not match:
        raise HTTPException(422, 'Use an HTTPS github.com/owner/repository URL, without credentials, query parameters or a commit path')
    owner, repo = match.groups()
    repo = repo.removesuffix('.git')
    if repo in {'', '.', '..'}:
        raise HTTPException(422, 'A GitHub repository name is required')
    return f'{owner}/{repo}'


def github_json(client, path, deadline):
    # All URLs are constructed here; never follow a user-supplied URL or redirect.
    if monotonic() > deadline:
        raise HTTPException(504, 'GitHub fetch timed out. Try again later.')
    with client.stream('GET', f'https://api.github.com/repos/{path}') as response:
        if response.status_code == 404:
            raise HTTPException(404, 'Repository or commit not found. Only public GitHub repositories are supported.')
        if response.status_code in {403, 429}:
            raise HTTPException(429, 'GitHub API rate limit or access restriction. Wait and try again; this POC uses public, unauthenticated requests.')
        if response.status_code in {409, 422}:
            raise HTTPException(422, 'The repository is empty or the branch / commit could not be resolved.')
        if response.status_code != 200:
            raise HTTPException(502, 'GitHub could not supply repository data. Redirects are not followed; use the current repository URL.')
        content = bytearray()
        for chunk in response.iter_bytes():
            content.extend(chunk)
            if len(content) > MAX_RESPONSE_BYTES:
                raise HTTPException(413, 'GitHub response exceeds the 2 MB intake limit. Choose a smaller commit.')
            if monotonic() > deadline:
                raise HTTPException(504, 'GitHub fetch timed out. Try again later.')
        try:
            data = json.loads(content)
        except (ValueError, UnicodeError):
            raise HTTPException(502, 'GitHub returned invalid repository data.')
        if not isinstance(data, dict):
            raise HTTPException(502, 'GitHub returned invalid repository data.')
        return data, 'rel="next"' in response.headers.get('link', '')


def fetch_commit(repo_url, ref=''):
    repository = repository_name(repo_url)
    ref = ref.strip()
    if ref and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_./-]{0,199}', ref):
        raise HTTPException(422, 'Use a branch name or commit SHA, not a URL or command.')
    deadline = monotonic() + 25
    try:
        with httpx.Client(timeout=httpx.Timeout(10, connect=5), follow_redirects=False, trust_env=False,
                          headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'AgentSentinel-POC',
                                   'X-GitHub-Api-Version': '2022-11-28'}) as client:
            repo, _ = github_json(client, repository, deadline)
            if repo.get('private') is not False:
                raise HTTPException(422, 'Only public GitHub repositories are supported.')
            target = ref or repo.get('default_branch', '')
            if not isinstance(target, str) or not target:
                raise HTTPException(422, 'The repository has no default branch. Choose a commit SHA.')
            data, paginated = github_json(client, f'{repository}/commits/{quote(target, safe="")}?per_page=100', deadline)
    except httpx.TimeoutException:
        raise HTTPException(504, 'GitHub fetch timed out. Try again later.')
    except httpx.HTTPError:
        raise HTTPException(502, 'Cannot reach GitHub. Check the backend internet connection.')
    sha = data.get('sha', '')
    files = data.get('files')
    info = data.get('commit')
    if not isinstance(sha, str) or not re.fullmatch(r'[a-fA-F0-9]{40}', sha) or not isinstance(files, list) or not isinstance(info, dict):
        raise HTTPException(502, 'GitHub returned an incomplete commit response.')
    pieces, summaries, notices = [], [], []
    remaining = MAX_DIFF_CHARS
    if paginated or len(files) > MAX_FILES:
        notices.append('Partial review: only the first 30 changed files from the first API page are included.')
    missing_patch = False
    for item in files[:MAX_FILES]:
        if not isinstance(item, dict) or not isinstance(item.get('filename'), str):
            raise HTTPException(502, 'GitHub returned an invalid changed-file entry.')
        name = item['filename'][:500]
        patch = item.get('patch')
        summaries.append({'filename': name, 'status': str(item.get('status', 'unknown'))[:40],
                          'patch_available': isinstance(patch, str)})
        if not isinstance(patch, str):
            missing_patch = True
            patch = '[GitHub did not return a text patch for this file.]'
        text = f'diff --git a/{name} b/{name}\n{patch}\n'
        if len(text) > remaining:
            if 'Partial review: diff limited to 20,000 characters.' not in notices:
                notices.append('Partial review: diff limited to 20,000 characters.')
            text = text[:remaining]
        pieces.append(text)
        remaining -= len(text)
    if missing_patch:
        notices.append('Some files have no text patch (binary, large or omitted by GitHub); their contents were not reviewed.')
    if not files:
        notices.append('No changed-file patches were returned for this commit.')
    return {'repository': repository, 'sha': sha.lower(),
            'url': f'https://github.com/{repository}/commit/{sha.lower()}',
            'repo_url': f'https://github.com/{repository}', 'branch': target,
            'message': str(info.get('message', 'GitHub commit'))[:1000],
            'file': summaries[0]['filename'] if summaries else '(no changed files)',
            'diff': ''.join(pieces), 'fixture': False, 'source': 'github',
            'files': summaries, 'notices': notices, 'partial': bool(notices),
            'fetched_at': datetime.now(timezone.utc).isoformat()}
