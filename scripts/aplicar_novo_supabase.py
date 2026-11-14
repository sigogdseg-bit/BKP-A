#!/usr/bin/env python3
"""
Script de automação para aplicação do banco completo no Supabase (GD Rastreamento).
Pode ser executado com:
  python3 scripts/aplicar_novo_supabase.py --senha "SUA_SENHA_POSTGRES"
  OU
  python3 scripts/aplicar_novo_supabase.py --token "SEU_PERSONAL_ACCESS_TOKEN_SBP"
"""

import sys
import os
import argparse
import urllib.request
import json

PROJECT_REF = "pflzopmxxawyqkgrlapq"
SQL_FILE = "supabase/CRIAR_BANCO_COMPLETO_NOVO_SUPABASE.sql"

def aplicar_via_pat(pat_token: str):
    print(f"[*] Aplicando schema via Supabase Management API no projeto {PROJECT_REF}...")
    if not os.path.exists(SQL_FILE):
        print(f"[!] Arquivo {SQL_FILE} não encontrado!")
        sys.exit(1)

    with open(SQL_FILE, "r", encoding="utf-8") as f:
        sql = f.read()

    url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
    headers = {
        "Authorization": f"Bearer {pat_token.strip()}",
        "Content-Type": "application/json"
    }

    req = urllib.request.Request(url, headers=headers, data=json.dumps({"query": sql}).encode("utf-8"))
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"[+] Sucesso! Status: {resp.status}")
            print("[+] Tabelas e migrações criadas com sucesso no Supabase!")
    except urllib.error.HTTPError as e:
        print(f"[!] Erro HTTP {e.code}: {e.read().decode('utf-8', errors='ignore')}")
        sys.exit(1)
    except Exception as e:
        print(f"[!] Erro ao executar: {e}")
        sys.exit(1)

def aplicar_via_postgres(senha: str):
    print(f"[*] Conectando diretamente ao PostgreSQL (db.{PROJECT_REF}.supabase.co:5432)...")
    try:
        import pg8000.native
    except ImportError:
        print("[!] pg8000 não instalado. Instale com pip install pg8000")
        sys.exit(1)

    if not os.path.exists(SQL_FILE):
        print(f"[!] Arquivo {SQL_FILE} não encontrado!")
        sys.exit(1)

    with open(SQL_FILE, "r", encoding="utf-8") as f:
        sql = f.read()

    try:
        conn = pg8000.native.Connection(
            user="postgres",
            password=senha.strip(),
            host=f"db.{PROJECT_REF}.supabase.co",
            port=5432,
            database="postgres",
            ssl_context=True
        )
        print("[+] Conectado com sucesso ao PostgreSQL!")
        print("[*] Executando script mestre de migrações (pode levar 30 a 60 segundos)...")
        conn.run(sql)
        print("[+] Migrações concluídas com sucesso!")
        conn.close()
    except Exception as e:
        print(f"[!] Erro na conexão/execução: {e}")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Aplicar banco GD Rastreamento no Supabase")
    parser.add_argument("--senha", help="Senha do banco de dados (usuário postgres)")
    parser.add_argument("--token", help="Personal Access Token do Supabase (sbp_...)")
    args = parser.parse_args()

    if args.token:
        aplicar_via_pat(args.token)
    elif args.senha:
        aplicar_via_postgres(args.senha)
    else:
        print("Uso: python3 scripts/aplicar_novo_supabase.py --senha <SENHA_DO_BANCO> OU --token <TOKEN_SBP>")
        sys.exit(1)
