"""Norte - backend em Flask + SQLite.

Rodar:  pip install -r requirements.txt   e depois   python app.py
Abrir:  http://127.0.0.1:5000
"""
import math
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, g, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "norte.db")

# static_url_path="" faz o Flask servir os arquivos de /static direto na raiz (/login.html, /script.js...)
app = Flask(__name__, static_folder=os.path.join(BASE, "static"), static_url_path="")
app.secret_key = os.environ.get("NORTE_SECRET", "chave-de-desenvolvimento-troque-depois")

CATEGORIAS = {
    "despesa": ["Alimentação", "Transporte", "Moradia", "Lazer", "Educação", "Saúde", "Assinaturas", "Outros"],
    "receita": ["Salário", "Serviços", "Outros"],
}

# Categorização automática: palavras-chave da descrição -> categoria sugerida
PALAVRAS = {
    "despesa": {
        "Alimentação": ["mercado", "supermercado", "restaurante", "lanche", "padaria", "pizza", "ifood", "açougue", "almoço", "jantar", "café"],
        "Transporte": ["combustível", "gasolina", "uber", "ônibus", "onibus", "passagem", "estacionamento", "pedágio", "táxi", "oficina"],
        "Moradia": ["aluguel", "condomínio", "condominio", "luz", "água", "agua", "energia", "internet", "gás", "iptu"],
        "Lazer": ["cinema", "show", "bar", "viagem", "jogo", "festa", "parque", "balada"],
        "Educação": ["curso", "faculdade", "livro", "escola", "mensalidade escolar", "apostila"],
        "Saúde": ["farmácia", "farmacia", "plano de saúde", "consulta", "médico", "remédio", "dentista", "exame"],
        "Assinaturas": ["netflix", "spotify", "streaming", "assinatura", "prime", "youtube"],
    },
    "receita": {
        "Salário": ["salário", "salario", "pagamento", "holerite", "13º"],
        "Serviços": ["freelance", "freela", "projeto", "serviço", "consultoria"],
    },
}


# ---------- Banco de dados ----------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def fechar_db(_erro):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def criar_tabelas():
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            senha_hash TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS transacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
            descricao TEXT NOT NULL,
            valor REAL NOT NULL CHECK (valor > 0),
            categoria TEXT NOT NULL,
            data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tetos (
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            categoria TEXT NOT NULL,
            limite REAL NOT NULL CHECK (limite > 0),
            PRIMARY KEY (usuario_id, categoria)
        );
        CREATE TABLE IF NOT EXISTS tokens_reset (
            email TEXT PRIMARY KEY,
            token TEXT NOT NULL,
            expira TEXT NOT NULL
        );
        """
    )
    db.commit()
    db.close()


# ---------- Utilidades ----------
def erro(msg, status=400):
    return jsonify(erro=msg), status


def dados_json():
    return request.get_json(silent=True) or {}


def login_obrigatorio(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "uid" not in session:
            return erro("Faça login para continuar.", 401)
        return f(*args, **kwargs)
    return wrapper


def email_valido(e):
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", e))


def validar_senha(senha):
    if len(senha) < 6:
        return "A senha deve ter pelo menos 6 caracteres."
    return None


def tx_para_json(r):
    # as chaves (desc, cat) são as mesmas que o front-end usa
    return {"id": r["id"], "type": r["tipo"], "desc": r["descricao"], "amount": r["valor"], "date": r["data"], "cat": r["categoria"]}


def validar_tx(d):
    tipo = d.get("type")
    desc = (d.get("desc") or "").strip()
    cat = d.get("cat")
    data = d.get("date") or ""
    try:
        valor = round(float(d.get("amount")), 2)
    except (TypeError, ValueError):
        return None, "Valor inválido."
    if tipo not in CATEGORIAS:
        return None, "Tipo deve ser receita ou despesa."
    if not desc:
        return None, "Informe uma descrição."
    if not math.isfinite(valor) or valor <= 0:
        return None, "Informe um valor maior que zero."
    if cat not in CATEGORIAS[tipo]:
        return None, "Categoria inválida."
    try:
        datetime.strptime(data, "%Y-%m-%d")
    except ValueError:
        return None, "Data inválida."
    return (tipo, desc, valor, cat, data), None


# ---------- Páginas ----------
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


# ---------- Autenticação ----------
@app.post("/api/cadastro")
def cadastro():
    d = dados_json()
    email = (d.get("email") or "").strip().lower()
    senha = d.get("password") or ""
    if not email_valido(email):
        return erro("Informe um e-mail válido.")
    msg = validar_senha(senha)
    if msg:
        return erro(msg)
    db = get_db()
    if db.execute("SELECT 1 FROM usuarios WHERE email = ?", (email,)).fetchone():
        return erro("Este e-mail já está cadastrado.", 409)
    cur = db.execute("INSERT INTO usuarios (email, senha_hash) VALUES (?, ?)", (email, generate_password_hash(senha)))
    db.commit()
    session["uid"], session["email"] = cur.lastrowid, email
    return jsonify(email=email), 201


@app.post("/api/login")
def login():
    d = dados_json()
    email = (d.get("email") or "").strip().lower()
    u = get_db().execute("SELECT * FROM usuarios WHERE email = ?", (email,)).fetchone()
    if not u or not check_password_hash(u["senha_hash"], d.get("password") or ""):
        return erro("E-mail ou senha incorretos.", 401)
    session["uid"], session["email"] = u["id"], u["email"]
    return jsonify(email=u["email"])


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/me")
@login_obrigatorio
def me():
    return jsonify(email=session["email"])


@app.post("/api/recuperar")
def recuperar():
    email = (dados_json().get("email") or "").strip().lower()
    db = get_db()
    if not db.execute("SELECT 1 FROM usuarios WHERE email = ?", (email,)).fetchone():
        return jsonify(ok=True)  # não revela se o e-mail existe
    token = str(secrets.randbelow(900000) + 100000)
    expira = (datetime.now() + timedelta(minutes=15)).isoformat()
    db.execute("INSERT OR REPLACE INTO tokens_reset (email, token, expira) VALUES (?, ?, ?)", (email, token, expira))
    db.commit()
    # Simulação: no projeto final o token iria por e-mail. Aqui devolvemos na resposta para a demo.
    return jsonify(ok=True, token=token)


@app.post("/api/redefinir")
def redefinir():
    d = dados_json()
    email = (d.get("email") or "").strip().lower()
    db = get_db()
    r = db.execute("SELECT * FROM tokens_reset WHERE email = ?", (email,)).fetchone()
    if not r or r["token"] != (d.get("token") or "").strip() or datetime.now() > datetime.fromisoformat(r["expira"]):
        return erro("Token inválido ou expirado.")
    senha = d.get("password") or ""
    msg = validar_senha(senha)
    if msg:
        return erro(msg)
    db.execute("UPDATE usuarios SET senha_hash = ? WHERE email = ?", (generate_password_hash(senha), email))
    db.execute("DELETE FROM tokens_reset WHERE email = ?", (email,))
    db.commit()
    return jsonify(ok=True)


# ---------- Lançamentos (CRUD) ----------
@app.get("/api/transacoes")
@login_obrigatorio
def listar_tx():
    rows = get_db().execute(
        "SELECT * FROM transacoes WHERE usuario_id = ? ORDER BY data DESC, id DESC", (session["uid"],)
    ).fetchall()
    return jsonify([tx_para_json(r) for r in rows])


@app.post("/api/transacoes")
@login_obrigatorio
def criar_tx():
    campos, msg = validar_tx(dados_json())
    if msg:
        return erro(msg)
    db = get_db()
    cur = db.execute(
        "INSERT INTO transacoes (usuario_id, tipo, descricao, valor, categoria, data) VALUES (?, ?, ?, ?, ?, ?)",
        (session["uid"], *campos),
    )
    db.commit()
    r = db.execute("SELECT * FROM transacoes WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(tx_para_json(r)), 201


@app.put("/api/transacoes/<int:tid>")
@login_obrigatorio
def editar_tx(tid):
    campos, msg = validar_tx(dados_json())
    if msg:
        return erro(msg)
    db = get_db()
    cur = db.execute(
        "UPDATE transacoes SET tipo = ?, descricao = ?, valor = ?, categoria = ?, data = ? WHERE id = ? AND usuario_id = ?",
        (*campos, tid, session["uid"]),
    )
    db.commit()
    if cur.rowcount == 0:
        return erro("Lançamento não encontrado.", 404)
    return jsonify(ok=True)


@app.delete("/api/transacoes/<int:tid>")
@login_obrigatorio
def excluir_tx(tid):
    db = get_db()
    cur = db.execute("DELETE FROM transacoes WHERE id = ? AND usuario_id = ?", (tid, session["uid"]))
    db.commit()
    if cur.rowcount == 0:
        return erro("Lançamento não encontrado.", 404)
    return jsonify(ok=True)


@app.get("/api/sugerir")
@login_obrigatorio
def sugerir():
    tipo = request.args.get("type", "despesa")
    desc = request.args.get("desc", "").lower()
    for cat, palavras in PALAVRAS.get(tipo, {}).items():
        if any(p in desc for p in palavras):
            return jsonify(cat=cat)
    return jsonify(cat=None)


# ---------- Tetos de gasto por categoria ----------
@app.get("/api/tetos")
@login_obrigatorio
def listar_tetos():
    rows = get_db().execute("SELECT categoria, limite FROM tetos WHERE usuario_id = ?", (session["uid"],)).fetchall()
    return jsonify({r["categoria"]: r["limite"] for r in rows})


@app.put("/api/tetos")
@login_obrigatorio
def salvar_teto():
    d = dados_json()
    cat = d.get("cat")
    try:
        limite = round(float(d.get("limit")), 2)
    except (TypeError, ValueError):
        return erro("Limite inválido.")
    if cat not in CATEGORIAS["despesa"]:
        return erro("Categoria inválida.")
    if not math.isfinite(limite) or limite <= 0:
        return erro("Informe um limite maior que zero.")
    db = get_db()
    db.execute(
        "INSERT INTO tetos (usuario_id, categoria, limite) VALUES (?, ?, ?) "
        "ON CONFLICT(usuario_id, categoria) DO UPDATE SET limite = excluded.limite",
        (session["uid"], cat, limite),
    )
    db.commit()
    return jsonify(ok=True)


@app.delete("/api/tetos/<cat>")
@login_obrigatorio
def remover_teto(cat):
    db = get_db()
    db.execute("DELETE FROM tetos WHERE usuario_id = ? AND categoria = ?", (session["uid"], cat))
    db.commit()
    return jsonify(ok=True)


criar_tabelas()

if __name__ == "__main__":
    app.run(debug=True)
