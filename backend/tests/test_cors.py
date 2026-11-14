WEB_APP = "http://localhost:5173"
WEB_APP_BY_IP = "http://127.0.0.1:5173"


def preflight(client, origin):
    # The question a browser asks before it sends a request with an Authorization header
    return client.options(
        "/api/assets",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )


def test_the_web_app_may_call_the_api(client):
    response = preflight(client, WEB_APP)

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == WEB_APP
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


def test_the_web_app_may_also_call_from_the_ip_address(client):
    response = preflight(client, WEB_APP_BY_IP)

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == WEB_APP_BY_IP


def test_any_other_website_is_refused(client):
    response = preflight(client, "https://evil.example.com")

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_the_total_count_header_can_be_read_by_the_web_app(client, auth_headers):
    headers = auth_headers("viewer@enersync.corp", role="Viewer")
    headers["Origin"] = WEB_APP

    response = client.get("/api/assets", headers=headers)

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == WEB_APP
    assert "x-total-count" in response.headers["access-control-expose-headers"].lower()
