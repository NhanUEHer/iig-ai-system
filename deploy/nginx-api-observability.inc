# Include inside every location /api/ block.
proxy_set_header X-Request-ID $request_id;
add_header X-Request-ID $upstream_http_x_request_id always;

# Keep a rotated file for incident export. The iig-nginx-api-log systemd
# service streams this file to journald for Netdata Logs Explorer.
access_log /var/log/nginx/iig_api_access.json iig_api_json;
