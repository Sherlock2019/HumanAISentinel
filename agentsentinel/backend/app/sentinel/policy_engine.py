PROTECTED_TOOLS = {'read_secret', 'read_prod_secret', 'modify_iam', 'disable_logging', 'disable_audit', 'modify_policy', 'bypass_sentinel', 'export_customer_database', 'upload_external'}
PROTECTED_RESOURCES = {'production_secrets', 'AWS_PRODUCTION_TOKEN', 'iam', 'audit_logs', 'sentinel_policy'}
WRITE_TOOLS = {'create_ticket', 'refund_customer', 'apply_patch', 'generate_patch', 'create_payment_request'}
EXECUTE_TOOLS = {'run_tests'}

def evaluate(action, policy):
    reasons = []
    tool_ok = action.tool in policy['allow'] or action.tool in policy['require_approval']
    resource_ok = action.resource in policy['resources_allow']
    critical = action.tool in PROTECTED_TOOLS or action.resource in PROTECTED_RESOURCES or any(s in action.resource.lower() for s in ['secret', 'token', 'credential'])
    # Explicit denies and protected operations cannot be overridden by any model.
    denied = action.tool in policy['deny'] or action.resource in policy['resources_deny'] or critical
    if action.tool in policy['deny']:
        reasons.append(f'Policy explicitly denies the tool “{action.tool}”.')
    if not tool_ok:
        reasons.append('Tool is outside the agent’s declared permissions (default deny).')
    if action.resource in policy['resources_deny'] or not resource_ok:
        reasons.append('Target resource is outside the approved resource scope.')
    if critical:
        reasons.append('Protected secret, privilege, exfiltration, or Sentinel control operation is prohibited.')
    destination = action.arguments.get('destination')
    if destination and destination not in policy['network_destinations']:
        denied = True
        critical = True
        reasons.append('Network destination is not approved; possible data exfiltration.')
    expected_operation = 'WRITE' if action.tool in WRITE_TOOLS else 'EXECUTE' if action.tool in EXECUTE_TOOLS else 'READ'
    operation_ok = action.operation == expected_operation
    if not operation_ok:
        denied = True
        reasons.append(f'Unexpected {action.operation} operation: this tool is restricted to {expected_operation} in the synthetic registry.')
    decision = 'BLOCK' if denied or not tool_ok or not resource_ok else 'REVIEW' if action.tool in policy['require_approval'] else 'ALLOW'
    if decision == 'REVIEW':
        reasons.append('This tool requires a human decision before execution.')
    return {'decision': decision, 'tool_allowed': tool_ok and not denied, 'resource_allowed': resource_ok and action.resource not in policy['resources_deny'], 'operation_allowed': operation_ok, 'critical': critical, 'score': 100 if critical else 75 if decision == 'BLOCK' else 55 if decision == 'REVIEW' else 5, 'reasons': reasons}
