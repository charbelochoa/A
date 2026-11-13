set -eu

task_archive="$1"
task_release="$2"
task_environment="$3"
case "$task_release" in
    ''|*[!0-9A-Za-z_-]*) exit 2 ;;
esac
task_root=/opt/aluranee
task_target="$task_root/releases/$task_release"
if [ -e "$task_target" ]; then
    printf '%s\n' 'La versión ya existe'
    exit 2
fi
if ss -ltn | awk '{print $4}' | grep -Eq ':8105$'; then
    if ! systemctl is-active --quiet aluranee; then
        printf '%s\n' 'El puerto reservado está ocupado'
        exit 2
    fi
fi
id aluranee >/dev/null 2>&1 || useradd --system --home-dir /var/lib/aluranee --shell /usr/sbin/nologin aluranee
install -d -m 0755 "$task_root" "$task_root/releases" "$task_target"
install -d -o aluranee -g aluranee -m 0700 /var/lib/aluranee
install -d -m 0700 /etc/aluranee
tar -xzf "$task_archive" -C "$task_target" --no-same-owner
chown -R root:root "$task_target"
chmod -R u=rwX,go=rX "$task_target"
if [ ! -x "$task_root/venv/bin/python" ]; then
    python3 -m venv "$task_root/venv"
fi
"$task_root/venv/bin/pip" install --disable-pip-version-check -r "$task_target/requirements.txt"
if [ ! -f /etc/aluranee/runtime.env ]; then
    install -m 0600 "$task_environment" /etc/aluranee/runtime.env
fi
task_previous=$(readlink "$task_root/current" || true)
ln -s "$task_target" "$task_root/current-$task_release"
mv -Tf "$task_root/current-$task_release" "$task_root/current"
install -m 0644 "$task_target/deploy/aluranee.service" /etc/systemd/system/aluranee.service
systemctl daemon-reload
systemctl enable aluranee
systemctl restart aluranee
sleep 2
if ! systemctl is-active --quiet aluranee; then
    if [ -n "$task_previous" ]; then
        ln -s "$task_previous" "$task_root/rollback-$task_release"
        mv -Tf "$task_root/rollback-$task_release" "$task_root/current"
        systemctl restart aluranee
    fi
    printf '%s\n' 'El servicio no inició; revisar el diario de Aluranee'
    exit 1
fi
task_config=/etc/caddy/aluranee-bank.caddy
task_backup="/etc/caddy/Caddyfile.pre-aluranee-$task_release"
cp -p /etc/caddy/Caddyfile "$task_backup"
if [ -e "$task_config" ]; then
    cp -p "$task_config" "$task_config.pre-$task_release"
fi
install -m 0644 "$task_target/deploy/Caddyfile" "$task_config"
if ! grep -Fxq 'import /etc/caddy/aluranee-bank.caddy' /etc/caddy/Caddyfile; then
    printf '\nimport /etc/caddy/aluranee-bank.caddy\n' >> /etc/caddy/Caddyfile
fi
if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
    cp -p "$task_backup" /etc/caddy/Caddyfile
    if [ -e "$task_config.pre-$task_release" ]; then
        cp -p "$task_config.pre-$task_release" "$task_config"
    fi
    exit 1
fi
if ! systemctl reload caddy; then
    cp -p "$task_backup" /etc/caddy/Caddyfile
    if [ -e "$task_config.pre-$task_release" ]; then
        cp -p "$task_config.pre-$task_release" "$task_config"
    fi
    systemctl reload caddy
    exit 1
fi
printf '%s\n' "Aluranee instalado: $task_release"
