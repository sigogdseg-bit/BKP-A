#!/bin/bash
set -e

# ==============================================================================
# HUNTER — ALIAS CANÔNICO PARA SALVAR MARCO DE SEGURANÇA
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/salvar_marco_seguranca.sh" "$@"
