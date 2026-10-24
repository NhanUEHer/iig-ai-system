# Include inside every location /api/ block.
proxy_set_header X-Request-ID $request_id;
add_header X-Request-ID $upstream_http_x_request_id always;

# Keep a rotated file for incident export and stream the same structured event
# to journald so Netdata Logs Explorer can search it immediately.
access_log /var/log/nginx/iig_api_access.json iig_api_json;
access_log syslog:server=unix:/dev/log,tag=iig_nginx_api,severity=info iig_api_json;
