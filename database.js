import Database from "better-sqlite3";

const db = new Database("carteira.db");

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nome       TEXT    NOT NULL,
    email      TEXT    NOT NULL UNIQUE,
    senha_hash TEXT    NOT NULL,
    criado_em  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ativos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT    NOT NULL UNIQUE,
    tipo        TEXT    NOT NULL,
    preco_atual REAL    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS aportes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id     INTEGER NOT NULL,
    ativo_id       INTEGER NOT NULL,
    quantidade     REAL    NOT NULL,
    preco_unitario REAL    NOT NULL,
    data           TEXT    NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (ativo_id)   REFERENCES ativos(id)   ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_aportes_usuario       ON aportes(usuario_id);
  CREATE INDEX IF NOT EXISTS idx_aportes_ativo_usuario ON aportes(ativo_id, usuario_id);
`);

//ON DELETE CASCADE: se um usuário for deletado, os aportes dele somem junto.
//ON DELETE RESTRICT: impede deletar um ativo que ainda tem aportes vinculados

//FUNÇÕES DE USUÁRIO
export function buscarUsuarioPorEmail(email) {
  return db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email);
}

export function buscarUsuarioPorId(id) {
  return db
    .prepare("SELECT id, nome, email, criado_em FROM usuarios WHERE id = ?")
    .get(id);
}

export function criarUsuario(nome, email, senhaHash) {
  return db
    .prepare("INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)")
    .run(nome, email, senhaHash);
}

//FUNÇÕES DE ATIVO
export function criarAtivo(nome, tipo, preco_atual) {
  const nomeNormalizado = nome.toUpperCase().trim();

  const existente = db
    .prepare("SELECT * FROM ativos WHERE nome = ?")
    .get(nomeNormalizado);
  if (existente) return existente;

  const r = db
    .prepare("INSERT INTO ativos (nome, tipo, preco_atual) VALUES (?, ?, ?)")
    .run(nomeNormalizado, tipo, preco_atual);

  return { id: r.lastInsertRowid, nome: nomeNormalizado, tipo, preco_atual };
}

export function buscarAtivoPorNome(nome) {
  return db
    .prepare("SELECT * FROM ativos WHERE nome = ?")
    .get(nome.toUpperCase().trim());
}

export function listarAtivos(usuario_id) {
  return db
    .prepare(
      `SELECT at.*
       FROM ativos at
       WHERE at.id IN (
         SELECT DISTINCT ativo_id
         FROM aportes
         WHERE usuario_id = ?
       )`
    )
    .all(usuario_id);
}

export function atualizarPrecoAtivo(id, novoPreco) {
  return db
    .prepare("UPDATE ativos SET preco_atual = ? WHERE id = ?")
    .run(novoPreco, id);
}

//FUNÇÕES DE APORTE
export function criarAporte(usuario_id, ativo_id, quantidade, preco_unitario, data) {
  return db
    .prepare(
      `INSERT INTO aportes (usuario_id, ativo_id, quantidade, preco_unitario, data)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(usuario_id, ativo_id, quantidade, preco_unitario, data);
}

export function listarAportes(usuario_id) {
  return db
    .prepare("SELECT * FROM aportes WHERE usuario_id = ?")
    .all(usuario_id);
}

export function deletarAporte(id, usuario_id) {
  return db
    .prepare("DELETE FROM aportes WHERE id = ? AND usuario_id = ?")
    .run(id, usuario_id);
}

//FUNÇÕES DE CÁLCULO
export function calcularResumoAtivo(ativo_id, usuario_id) {
  return db
    .prepare(
      `SELECT
         at.id,
         at.nome,
         at.tipo,
         at.preco_atual,
         IFNULL(SUM(ap.quantidade), 0)                          AS quantidade_total,
         IFNULL(SUM(ap.quantidade * ap.preco_unitario), 0)      AS total_investido,
         IFNULL(SUM(ap.quantidade), 0) * at.preco_atual         AS valor_atual,
         (IFNULL(SUM(ap.quantidade), 0) * at.preco_atual)
           - IFNULL(SUM(ap.quantidade * ap.preco_unitario), 0)  AS lucro_prejuizo
       FROM ativos at
       LEFT JOIN (
         SELECT * FROM aportes
         WHERE usuario_id = ? AND ativo_id = ?
       ) ap ON ap.ativo_id = at.id
       WHERE at.id = ?
       GROUP BY at.id`
    )
    .get(usuario_id, ativo_id, ativo_id);
}

export function calcularCarteiraTotal(usuario_id) {
  return db
    .prepare(
      `SELECT IFNULL(SUM(ap.quantidade * at.preco_atual), 0) AS valor_total
       FROM aportes ap
       JOIN ativos at ON ap.ativo_id = at.id
       WHERE ap.usuario_id = ?`
    )
    .get(usuario_id);
}

export default db;