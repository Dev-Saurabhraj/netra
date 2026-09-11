"""initial_schema

Revision ID: 20260831_0001
Revises: 
Create Date: 2026-08-31 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '20260831_0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('email', sa.String(length=255), nullable=False, unique=True, index=True),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('role', sa.Enum('ADMIN', 'OPERATOR', 'VIEWER', name='userrole'), nullable=False, server_default='VIEWER'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )

    # Credentials table
    op.create_table(
        'credentials',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('name', sa.String(length=128), nullable=False, unique=True),
        sa.Column('cred_type', sa.Enum('SNMP_V2C', 'SNMP_V3', 'SSH', name='credentialtype'), nullable=False),
        sa.Column('community', sa.String(length=128), nullable=True),
        sa.Column('username', sa.String(length=128), nullable=True),
        sa.Column('auth_password', sa.String(length=255), nullable=True),
        sa.Column('priv_password', sa.String(length=255), nullable=True),
        sa.Column('auth_protocol', sa.String(length=32), nullable=True),
        sa.Column('priv_protocol', sa.String(length=32), nullable=True),
        sa.Column('port', sa.Integer(), nullable=False, server_default='161'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )

    # Discovery Targets table
    op.create_table(
        'discovery_targets',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('target_type', sa.Enum('IP', 'CIDR', 'HOSTNAME', name='targettype'), nullable=False),
        sa.Column('target_value', sa.String(length=255), nullable=False),
        sa.Column('credential_id', sa.String(length=36), sa.ForeignKey('credentials.id', ondelete='SET NULL'), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )

    # Discovery Runs table
    op.create_table(
        'discovery_runs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('status', sa.Enum('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', name='discoveryrunstatus'), nullable=False, index=True),
        sa.Column('total_targets', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('processed_targets', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('successful_targets', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed_targets', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_summary', sa.Text(), nullable=True),
        sa.Column('logs', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    # Observations table
    op.create_table(
        'observations',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('discovery_run_id', sa.String(length=36), sa.ForeignKey('discovery_runs.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('source_type', sa.Enum('ICMP', 'SNMP', 'LLDP', 'CDP', 'ARP', 'MAC_TABLE', name='observationsourcetype'), nullable=False, index=True),
        sa.Column('target', sa.String(length=128), nullable=False, index=True),
        sa.Column('observed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('raw_payload', sa.JSON(), nullable=False),
        sa.Column('normalized_data', sa.JSON(), nullable=False),
        sa.Column('error', sa.Text(), nullable=True),
    )

    # Devices table
    op.create_table(
        'devices',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('hostname', sa.String(length=255), nullable=False, index=True),
        sa.Column('management_ip', sa.String(length=64), nullable=False, index=True),
        sa.Column('mac_address', sa.String(length=32), nullable=True, index=True),
        sa.Column('chassis_id', sa.String(length=128), nullable=True, index=True),
        sa.Column('serial_number', sa.String(length=128), nullable=True),
        sa.Column('vendor', sa.String(length=128), nullable=False, server_default='Generic'),
        sa.Column('model', sa.String(length=128), nullable=True),
        sa.Column('device_type', sa.Enum('ROUTER', 'SWITCH', 'FIREWALL', 'SERVER', 'ACCESS_POINT', 'HOST', 'UNKNOWN', name='devicetype'), nullable=False, index=True),
        sa.Column('status', sa.Enum('ONLINE', 'OFFLINE', 'WARNING', 'DEGRADED', 'UNKNOWN', name='devicestatus'), nullable=False, index=True),
        sa.Column('sys_descr', sa.Text(), nullable=True),
        sa.Column('sys_object_id', sa.String(length=128), nullable=True),
        sa.Column('attributes', sa.JSON(), nullable=False),
        sa.Column('first_seen', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_seen', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )

    # Interfaces table
    op.create_table(
        'interfaces',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('device_id', sa.String(length=36), sa.ForeignKey('devices.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('if_index', sa.Integer(), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('mac_address', sa.String(length=32), nullable=True, index=True),
        sa.Column('ip_address', sa.String(length=64), nullable=True, index=True),
        sa.Column('netmask', sa.String(length=64), nullable=True),
        sa.Column('admin_status', sa.Enum('UP', 'DOWN', 'TESTING', name='interfaceadminstatus'), nullable=False),
        sa.Column('oper_status', sa.Enum('UP', 'DOWN', 'TESTING', 'UNKNOWN', 'DORMANT', 'NOT_PRESENT', 'LOWER_LAYER_DOWN', name='interfaceoperstatus'), nullable=False),
        sa.Column('speed', sa.BigInteger(), nullable=True),
        sa.Column('duplex', sa.String(length=32), nullable=True),
        sa.Column('vlan', sa.Integer(), nullable=True),
        sa.Column('metadata_info', sa.JSON(), nullable=False),
        sa.Column('first_seen', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_seen', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('device_id', 'if_index', name='uq_device_if_index'),
    )

    # Links table
    op.create_table(
        'links',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('source_device_id', sa.String(length=36), sa.ForeignKey('devices.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('source_interface_id', sa.String(length=36), sa.ForeignKey('interfaces.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('destination_device_id', sa.String(length=36), sa.ForeignKey('devices.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('destination_interface_id', sa.String(length=36), sa.ForeignKey('interfaces.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('status', sa.Enum('ACTIVE', 'DEGRADED', 'DOWN', 'REMOVED', 'CONFLICT', name='linkstatus'), nullable=False, index=True),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('discovery_methods', sa.JSON(), nullable=False),
        sa.Column('evidence', sa.JSON(), nullable=False),
        sa.Column('first_seen', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_seen', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('source_device_id', 'source_interface_id', 'destination_device_id', 'destination_interface_id', name='uq_device_link_endpoints'),
    )

    # Topology Snapshots table
    op.create_table(
        'topology_snapshots',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('discovery_run_id', sa.String(length=36), sa.ForeignKey('discovery_runs.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('graph_data', sa.JSON(), nullable=False),
        sa.Column('node_count', sa.Float(), nullable=False, server_default='0'),
        sa.Column('edge_count', sa.Float(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, index=True),
    )

    # Events table
    op.create_table(
        'events',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('event_type', sa.Enum('NEW_DEVICE', 'DEVICE_REMOVED', 'DEVICE_DOWN', 'DEVICE_RECOVERED', 'LINK_ADDED', 'LINK_REMOVED', 'LINK_RECOVERED', 'INTERFACE_DOWN', 'INTERFACE_RECOVERED', 'TOPOLOGY_CONFLICT', 'DISCOVERY_STARTED', 'DISCOVERY_COMPLETED', 'DISCOVERY_FAILED', name='eventtype'), nullable=False, index=True),
        sa.Column('severity', sa.Enum('INFO', 'WARNING', 'CRITICAL', name='eventseverity'), nullable=False, index=True),
        sa.Column('device_id', sa.String(length=36), sa.ForeignKey('devices.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('link_id', sa.String(length=36), sa.ForeignKey('links.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('interface_id', sa.String(length=36), sa.ForeignKey('interfaces.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('previous_state', sa.JSON(), nullable=True),
        sa.Column('new_state', sa.JSON(), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False, index=True),
    )

    # Audit Logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('action', sa.String(length=128), nullable=False, index=True),
        sa.Column('resource_type', sa.String(length=64), nullable=True),
        sa.Column('resource_id', sa.String(length=64), nullable=True),
        sa.Column('details', sa.JSON(), nullable=False),
        sa.Column('ip_address', sa.String(length=64), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False, index=True),
    )


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('events')
    op.drop_table('topology_snapshots')
    op.drop_table('links')
    op.drop_table('interfaces')
    op.drop_table('devices')
    op.drop_table('observations')
    op.drop_table('discovery_runs')
    op.drop_table('discovery_targets')
    op.drop_table('credentials')
    op.drop_table('users')

