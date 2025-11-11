#!/bin/bash
# Script para instalar y configurar Grafana Agent en tu servidor de producción
# Ejecuta este script en el servidor donde está desplegado tu backend

set -e

echo "🚀 Instalando Grafana Agent..."

# Detectar sistema operativo
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    echo "📦 Detectado: Linux"
    
    # Descargar Grafana Agent
    AGENT_VERSION="v0.38.1"
    wget -q "https://github.com/grafana/agent/releases/download/${AGENT_VERSION}/grafana-agent-linux-amd64.zip"
    unzip -q grafana-agent-linux-amd64.zip
    chmod +x grafana-agent-linux-amd64
    sudo mv grafana-agent-linux-amd64 /usr/local/bin/grafana-agent
    rm grafana-agent-linux-amd64.zip
    
    echo "✅ Grafana Agent instalado en /usr/local/bin/grafana-agent"
    
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "📦 Detectado: macOS"
    brew install grafana/grafana/grafana-agent
    echo "✅ Grafana Agent instalado via Homebrew"
fi

# Crear directorio de configuración
sudo mkdir -p /etc/grafana-agent
sudo mkdir -p /var/lib/grafana-agent

# Copiar configuración
echo "📝 Configurando Grafana Agent..."
cat > /tmp/agent-config.yaml << 'EOF'
server:
  log_level: info

metrics:
  global:
    scrape_interval: 15s
    remote_write:
      - url: https://prometheus-prod-XX-XX.grafana.net/api/prom/push
        basic_auth:
          username: TU_USERNAME_AQUI
          password: TU_API_TOKEN_AQUI

  configs:
    - name: mercador
      scrape_configs:
        - job_name: 'mercador-backend'
          scrape_interval: 15s
          metrics_path: '/metrics'
          static_configs:
            - targets: ['localhost:3010']
              labels:
                environment: 'production'
                service: 'backend'
                app: 'mercador'
EOF

sudo mv /tmp/agent-config.yaml /etc/grafana-agent/agent.yaml

echo "⚠️  IMPORTANTE: Edita /etc/grafana-agent/agent.yaml con tus credenciales de Grafana Cloud"
echo ""
echo "🔧 Para editar: sudo nano /etc/grafana-agent/agent.yaml"
echo ""
echo "Debes reemplazar:"
echo "  - url: TU_PROMETHEUS_ENDPOINT"
echo "  - username: TU_USERNAME"
echo "  - password: TU_API_TOKEN"
echo ""

# Crear servicio systemd
cat > /tmp/grafana-agent.service << 'EOF'
[Unit]
Description=Grafana Agent
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/grafana-agent -config.file=/etc/grafana-agent/agent.yaml -metrics.wal-directory=/var/lib/grafana-agent/wal
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo mv /tmp/grafana-agent.service /etc/systemd/system/grafana-agent.service

echo "🎯 Servicio systemd creado"
echo ""
echo "Comandos disponibles:"
echo "  sudo systemctl start grafana-agent    # Iniciar"
echo "  sudo systemctl status grafana-agent   # Ver estado"
echo "  sudo systemctl enable grafana-agent   # Auto-iniciar en boot"
echo "  sudo journalctl -u grafana-agent -f   # Ver logs"
echo ""
echo "✅ Instalación completa!"
echo "⚠️  No olvides editar las credenciales antes de iniciar"
