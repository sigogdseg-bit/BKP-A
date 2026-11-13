#!/bin/bash
set -e

# ==============================================================================
# HUNTER — ALIAS CANÔNICO PARA RESTAURAR MARCO DE SEGURANÇA
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/restaurar_marco_seguranca.sh" "$@"
