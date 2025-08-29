#!/usr/bin/env bash
# SoftEther VPN Server Installer Script
# Register vultr.com with free credit https://www.vultr.com/?ref=9771340-9J
# Create VPS
# Tested on Ubuntu 24.04, Debian 12.0
# Instructions:
# 1. Save this file as softether-installer.sh
# 2. chmod +x softether-installer.sh
# 3. Run: ./softether-installer.sh or bash softether-installer.sh
# 4. Initialize VPN server config: /usr/local/vpnserver/vpncmd
# 5. Set server password: ServerPasswordSet {yourPassword}
# 6. Use SoftEther VPN Server Manager to manage your server
# 7. Load your own certificate if you have one.
set -euo pipefail

# --- Configuration ---
INSTALL_DIR="/usr/local/vpnserver"
BACKUP_DIR="/usr/local/vpnserver_bak"
SYSTEMD_SERVICE_PATH="/etc/systemd/system/vpnserver.service" # Use /etc/systemd/system for local units

# --- Main Script ---

echo "Starting SoftEther VPN Server installation..."

# Check for root privileges
if [ "$(id -u)" -ne 0 ]; then
    echo "Error: This script must be run as root." >&2
    exit 1
fi

# Update package list and install dependencies
# Use -qq for quieter output. Install necessary packages.
echo "Updating package list and installing dependencies..."
# Add jq for robust JSON parsing of GitHub API
apt update -qq && apt install -yqq build-essential wget curl gcc make tzdata git libreadline-dev libncurses-dev libssl-dev zlib1g-dev jq

# Fetch latest stable version URL using GitHub API and jq for robustness
echo "Fetching latest SoftEther VPN version..."
SOFTETHER_VERSION=$(curl -s "https://api.github.com/repos/SoftEtherVPN/SoftEtherVPN_Stable/releases/latest" | \
    jq -r '.tag_name' | \
    sed 's/^v//') # Remove 'v' prefix from tag name if present

if [ -z "$SOFTETHER_VERSION" ]; then
    echo "Error: Could not determine the latest SoftEther VPN version." >&2
    exit 1
fi
echo "Found version: $SOFTETHER_VERSION"

DOWNLOAD_URL="https://github.com/SoftEtherVPN/SoftEtherVPN_Stable/releases/download/v${SOFTETHER_VERSION}/vpnserver-${SOFTETHER_VERSION}-linux-x64-64bit.tar.gz"

# Create a temporary directory for download
TEMP_DIR=$(mktemp -d)
DOWNLOAD_PATH="${TEMP_DIR}/softether-vpnserver.tar.gz"

# Download SoftEther source
echo "Downloading SoftEther VPN from ${DOWNLOAD_URL}..."
if ! wget "${DOWNLOAD_URL}" -O "${DOWNLOAD_PATH}"; then
    echo "Error: Download failed." >&2
    rm -rf "${TEMP_DIR}"
    exit 1
fi

# Stop service if running
echo "Stopping existing vpnserver service (if running)..."
# Check if the service is active before attempting to stop
systemctl is-active --quiet vpnserver && systemctl stop vpnserver

# Backup existing installation if it exists
if [ -d "${INSTALL_DIR}" ]; then
    echo "Backing up existing installation to ${BACKUP_DIR}..."
    # Remove previous backup first for a clean backup
    if [ -d "${BACKUP_DIR}" ]; then
        echo "Removing previous backup directory ${BACKUP_DIR}..."
        rm -rf "${BACKUP_DIR}"
    fi
    if ! mv "${INSTALL_DIR}" "${BACKUP_DIR}"; then
         echo "Warning: Failed to backup existing installation. Proceeding with caution." >&2
         # Do not exit, try to continue installation
    fi
fi

# Extract SoftEther source
echo "Extracting SoftEther VPN to ${INSTALL_DIR}..."
if ! mkdir -p "${INSTALL_DIR}" || ! tar -xzvf "${DOWNLOAD_PATH}" -C "${INSTALL_DIR}"; then
    echo "Error: Extraction failed." >&2
    rm -rf "${TEMP_DIR}"
    exit 1
fi

# Restore configuration file from backup if it exists
if [ -f "${BACKUP_DIR}/vpn_server.config" ]; then
    echo "Restoring configuration file from backup..."
    if ! cp "${BACKUP_DIR}/vpn_server.config" "${INSTALL_DIR}/vpn_server.config"; then
        echo "Warning: Failed to restore configuration file from backup." >&2
        # Do not exit, continue installation
    else
        # Optionally remove the backup after successful restore
        echo "Removing backup directory ${BACKUP_DIR}..."
        rm -rf "${BACKUP_DIR}"
    fi
fi

# Clean up the downloaded tarball and temporary directory
echo "Cleaning up temporary files..."
rm -rf "${TEMP_DIR}"

# Build SoftEther
echo "Building SoftEther VPN..."
pushd "${INSTALL_DIR}" >/dev/null # Change directory silently
if ! ./configure || ! make; then
    echo "Error: Build failed." >&2
    popd >/dev/null # Return to previous directory silently
    exit 1
fi

# Perform final installation steps (permissions, etc.) - as per original script's make install
echo "Performing final installation steps..."
# The 'make install' target in SoftEther's Makefile often just sets permissions or is a placeholder.
# Keeping it to match the original script's logic.
if ! make install; then
     echo "Error: make install failed." >&2
     popd >/dev/null
     exit 1
fi

popd >/dev/null # Return to previous directory

# Set file permissions
echo "Setting file permissions..."
# Set restrictive permissions for all files, then make executables runnable.
chmod 0600 "${INSTALL_DIR}"/*
chmod +x "${INSTALL_DIR}/vpnserver" "${INSTALL_DIR}/vpncmd"

# Add systemd service
echo "Creating systemd service unit file at ${SYSTEMD_SERVICE_PATH}..."
cat <<EOF >"${SYSTEMD_SERVICE_PATH}"
[Unit]
Description=SoftEther VPN Server
After=network.target auditd.service
ConditionPathExists=!${INSTALL_DIR}/do_not_run
[Service]
Type=forking
# The original script included 'EnvironmentFile=-${INSTALL_DIR}'.
# This path is highly unusual for an environment file and likely a misconfiguration.
# EnvironmentFile expects a file containing KEY=VALUE pairs, typically in /etc/default/.
# Removing it as it's unlikely to be correct or intended for this path.
ExecStart=${INSTALL_DIR}/vpnserver start
ExecStop=${INSTALL_DIR}/vpnserver stop
KillMode=process
Restart=on-failure
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=full
ReadOnlyDirectories=/
ReadWriteDirectories=-${INSTALL_DIR}
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_BROADCAST CAP_NET_RAW CAP_SYS_NICE CAP_SYS_ADMIN CAP_SETUID
[Install]
WantedBy=multi-user.target
EOF

# Reload systemd, enable and start the service
echo "Reloading systemd, enabling and starting the service..."
systemctl daemon-reload
systemctl enable vpnserver
systemctl restart vpnserver

echo "SoftEther VPN Server installation complete."
echo ""
echo "Next steps:"
echo "1. Initialize VPN server config: ${INSTALL_DIR}/vpncmd"
echo "2. Set server password using 'ServerPasswordSet {yourPassword}' in vpncmd."
echo "3. Use SoftEther VPN Server Manager to manage your server."
echo "4. Load your own certificate if you have one."

exit 0
