#!/bin/bash
# Ensure log directory is writable by the credmgr user when bind-mounted
# from the host (Docker creates bind mounts as root).
if [ "$(id -u)" = "0" ]; then
    chown -R credmgr:credmgr /var/log/credmgr 2>/dev/null || true
    exec gosu credmgr python3 "$@"
else
    exec python3 "$@"
fi
