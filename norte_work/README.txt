NORTE FINANÇAS (SGFP) — PROTÓTIPO ALINHADO AO ESCOPO

Telas (7, conforme o documento de escopo):
1. login.html       -> login
2. cadastro.html    -> cadastro de usuário
3. recuperar.html   -> recuperação de senha (solicitação do token + redefinição)
4. dashboard.html#dashboard   -> saldo total, entradas, saídas e alertas
5. dashboard.html#lancamento  -> formulário de receita/despesa (com categoria sugerida por palavra-chave)
6. dashboard.html#extrato     -> extrato com filtro por mês e ano (editar/excluir)
7. dashboard.html#metas       -> teto de gastos por categoria
Também: index.html (página inicial).

Sem banco de dados nesta versão: usuários, lançamentos e tetos ficam no localStorage, separados por usuário.
Senhas são guardadas como hash SHA-256 (simulação); no projeto final: Flask + SQLite.
O token de recuperação é exibido na tela (simula o e-mail).
