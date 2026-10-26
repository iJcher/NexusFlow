"""Runtime governance independent of immutable published definition budgets."""
import math
import os


def unlimited_token_reservations():
    return (os.getenv('NF_TOKEN_RESERVATION_POLICY') == 'unlimited'
            and os.getenv('NF_VALIDATION_UNPRICED') == 'true')


def runtime_budget_spec(spec):
    if not unlimited_token_reservations():
        return spec
    # Infinity is an in-memory unbounded limit, never a large pretend cap or a
    # serialized DSL value. Old pinned engines can keep their numeric comparisons.
    return {**spec, 'budget':{**spec['budget'], 'maxTokens':math.inf}}
