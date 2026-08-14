import hmac

from app.security import new_nonce


def test_nonce_is_random_and_nontrivial():
    values = {new_nonce() for _ in range(20)}
    assert len(values) == 20
    assert all(len(value) >= 20 for value in values)
