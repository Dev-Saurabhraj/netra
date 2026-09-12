#!/bin/sh

# Start lldpd daemon in background
lldpd -d -s &

# Start snmpd daemon in foreground with custom config
exec snmpd -f -Lo -c /etc/snmp/snmpd.conf

