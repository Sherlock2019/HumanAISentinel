from uuid import uuid4

EXECUTIONS = []

def execute(action):
    # This registry only returns synthetic values. No filesystem, shell, network,
    # payment, secret, or infrastructure operation is ever performed.
    result = {'simulation': True, 'receipt': str(uuid4()), 'tool': action.tool, 'resource': action.resource, 'message': f'Synthetic {action.tool} completed in the sandbox.'}
    EXECUTIONS.append(result)
    return result
