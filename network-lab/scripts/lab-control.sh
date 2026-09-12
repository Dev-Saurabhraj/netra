#!/bin/bash
set -e

ACTION=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB_COMPOSE="$SCRIPT_DIR/../docker-compose.lab.yml"

case "$ACTION" in
    start)
        echo "🚀 Starting NETRA Simulated Network Lab (6 nodes)..."
        docker compose -f "$LAB_COMPOSE" up -d --build
        echo "✅ Network Lab is running on subnet 192.168.100.0/24"
        ;;
    stop)
        echo "🛑 Stopping Network Lab..."
        docker compose -f "$LAB_COMPOSE" down
        echo "✅ Network Lab stopped."
        ;;
    status)
        docker compose -f "$LAB_COMPOSE" ps
        ;;
    link-down-sw2)
        echo "⚠️ Simulating Link Failure: Disconnecting SW2 from lab network..."
        docker network disconnect netra_lab_net netra-lab-sw2
        echo "✅ SW2 link is now DOWN."
        ;;
    link-up-sw2)
        echo "🔄 Restoring Link: Reconnecting SW2 to lab network..."
        docker network connect --ip 192.168.100.3 netra_lab_net netra-lab-sw2
        echo "✅ SW2 link is now RECOVERED."
        ;;
    add-sw4)
        echo "➕ Simulating New Device: Launching Access Switch 4 (SW4)..."
        docker run -d --name netra-lab-sw4 --hostname SW4-NewSwitch --net netra_lab_net --ip 192.168.100.5 alpine:3.19 sleep infinity
        echo "✅ SW4 added at 192.168.100.5."
        ;;
    remove-sw4)
        echo "➖ Removing simulated SW4..."
        docker rm -f netra-lab-sw4
        echo "✅ SW4 removed."
        ;;
    *)
        echo "Usage: $0 {start|stop|status|link-down-sw2|link-up-sw2|add-sw4|remove-sw4}"
        exit 1
        ;;
esac

