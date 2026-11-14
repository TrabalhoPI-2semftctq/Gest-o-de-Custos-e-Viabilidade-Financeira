NORTE FINANÇAS (SGFP) — PROTÓTIPO FUNCIONAL COM BACKEND

Tecnologias: Python + Flask (backend), SQLite (banco), HTML/CSS/JavaScript (frontend).

Como rodar:
1. pip install -r requirements.txt
2. python app.py
3. Abrir http://127.0.0.1:5000 no navegador
(O arquivo norte.db é criado sozinho na primeira execução.)

Estrutura:
app.py          -> servidor Flask: rotas da API, regras e acesso ao SQLite
static/         -> telas (HTML), estilo (styles.css) e script.js (chama a API com fetch)
norte.db        -> banco SQLite (gerado automaticamente)

Telas:
1. login.html                  -> login
2. cadastro.html               -> cadastro de usuário
3. recuperar.html              -> recuperação de senha (token + redefinição)
4. dashboard.html#dashboard    -> saldo total, entradas, saídas e alertas
5. dashboard.html#lancamento   -> receita/despesa (categoria sugerida por palavra-chave)
6. dashboard.html#extrato      -> extrato com filtro por mês e ano (editar/excluir)
7. dashboard.html#metas        -> teto de gastos por categoria
Também: index.html (página inicial).

Banco de dados (tabelas):
usuarios(id, email, senha_hash)
transacoes(id, usuario_id, tipo, descricao, valor, categoria, data)
tetos(usuario_id, categoria, limite)
tokens_reset(email, token, expira)

Principais rotas da API:
POST /api/cadastro, /api/login, /api/logout, /api/recuperar, /api/redefinir   GET /api/me
GET/POST /api/transacoes      PUT/DELETE /api/transacoes/<id>
GET /api/sugerir              (categoria sugerida pela descrição)
GET/PUT /api/tetos            DELETE /api/tetos/<categoria>

Observações:
- Senhas são guardadas com hash (werkzeug), nunca em texto puro.
- Cada usuário só enxerga os próprios dados (todas as consultas filtram por usuario_id).
- O token de recuperação aparece na tela para simular o e-mail (demonstração).
