import express from "express";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors";
import rateLimit from "express-rate-limit";
import validator from "validator";
import {
  criarUsuario,
  buscarUsuarioPorEmail,
  buscarUsuarioPorId,
  contarAtivosUsuario,
  usuarioPossuiAtivo,
  criarAtivo,
  buscarAtivoPorNome,
  listarAtivos,
  atualizarPrecoAtivo,
  criarAporte,
  listarAportes,
  deletarAporte,
  calcularResumoAtivo,
  calcularCarteiraTotal,
} from "./database.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRA_EM = "7d";
const COOKIE_NOME = "token";

function emitirToken(res, usuarioId) {
  const token = jwt.sign({ sub: usuarioId }, JWT_SECRET, { expiresIn: JWT_EXPIRA_EM });

  const isProd = process.env.NODE_ENV === "production";

  res.cookie(COOKIE_NOME, token, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",  // "none" permite cross-origin em produção
    secure: isProd,                      // obrigatório quando sameSite é "none"
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function autenticar(req, res, next) {
  const token = req.cookies?.[COOKIE_NOME];

  if (!token) {
    return res.status(401).json({ erro: "Não autenticado. Faça login." });
  }

  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie(COOKIE_NOME);
    return res.status(401).json({ erro: "Sessão expirada. Faça login novamente." });
  }
}

function emailValido(email) {
  return validator.isEmail(email);
}

// Limite geral — todas as rotas
const limitadorGeral = rateLimit({
  windowMs: 15 * 60 * 1000, // janela de 15 minutos
  max: 100,                  // máximo 100 requisições por IP
  message: { erro: "Muitas requisições. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limite mais restritivo para login e registro — previne brute force
const limitadorAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,                   // máximo 10 tentativas por IP
  message: { erro: "Muitas tentativas. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limitadorGeral);
app.use(cookieParser()); //lê o header Cookie da requisição e transforma num objeto req.cookies
app.use(express.json());
app.use(express.static("public"));
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://dashboard-acoes-react.vercel.app",
  ],
  credentials: true, //permite enviar cookies JWT
}));

app.get("/", (req, res) => {
  res.redirect("/login.html");
});

app.get("/api/ping", (req, res) => {
  res.json({ ok: true, mensagem: "Servidor funcionando." });
});

app.get("/api/eu", autenticar, (req, res) => {
  const usuario = buscarUsuarioPorId(req.usuario.sub);
  if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado." });
  return res.json({ usuario });
});

app.post("/api/registro", limitadorAuth, async (req, res) => {
  try {
    const { nome, email, senha } = req.body ?? {};

    //validações antes do banco
    // Tamanho máximo para evitar payloads gigantes
    if (!nome || nome.trim().length < 2 || nome.trim().length > 50) {
      return res.status(400).json({ erro: "Nome deve ter entre 2 e 50 caracteres." });
    }

    // Sanitiza o nome
    // remove tags HTML, espaços extras
    const nomeSeguro = validator.escape(nome.trim());

    if (!email || !emailValido(email)) {
      return res.status(400).json({ erro: "E-mail inválido." });
    }

    if (!senha || senha.length < 8 || senha.length > 72) {
      // 72 é o limite do bcrypt
      // senhas maiores são truncadas silenciosamente
      return res.status(400).json({ erro: "Senha deve ter entre 8 e 72 caracteres." });
    }

    const emailNormalizado = email.toLowerCase().trim();

    if (buscarUsuarioPorEmail(emailNormalizado)) {
      return res.status(409).json({ erro: "E-mail já cadastrado." });
    }

    //bcrypt é assíncrono de propósito , é intencionalmente lento
    const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);
    const resultado = criarUsuario(nomeSeguro, emailNormalizado, senhaHash);

    return res.status(201).json({
      mensagem: "Conta criada com sucesso.",
      usuario: { id: resultado.lastInsertRowid, nome: nomeSeguro },
    });
  } catch (err) {
    console.error("[registro]", err);
    return res.status(500).json({ erro: "Erro interno." });
  }
});

app.post("/api/login", limitadorAuth, async (req, res) => {
  try {
    const { email, senha } = req.body ?? {};

    if (!email || !senha) {
      return res.status(400).json({ erro: "E-mail e senha são obrigatórios." });
    }

    const usuario = buscarUsuarioPorEmail(email.toLowerCase().trim());

    const senhaCorreta = usuario
      ? await bcrypt.compare(senha, usuario.senha_hash)
      : false;

    if (!usuario || !senhaCorreta) {
      return res.status(401).json({ erro: "E-mail ou senha incorretos." });
    }

    emitirToken(res, usuario.id);

    return res.json({
      mensagem: "Login realizado.",
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
    });
  } catch (err) {
    console.error("[login]", err);
    return res.status(500).json({ erro: "Erro interno." });
  }
});

app.post("/api/logout", (req, res) => {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie(COOKIE_NOME, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
  });
  return res.json({ mensagem: "Logout realizado." });
});

// Lista só os ativos em que o usuário logado tem aportes
app.get("/api/ativos", autenticar, (req, res) => {
  res.json(listarAtivos(req.usuario.sub));
});

app.post("/api/aportes", autenticar, (req, res) => {
  const { ativo_id, quantidade, preco_unitario, data } = req.body ?? {};

  if (!ativo_id || !quantidade || !preco_unitario || !data) {
    return res.status(400).json({ erro: "ativo_id, quantidade, preco_unitario e data são obrigatórios." });
  }

  const r = criarAporte(req.usuario.sub, ativo_id, quantidade, preco_unitario, data);
  res.status(201).json({ id: r.lastInsertRowid });
});

app.post("/api/aportes/ticker", autenticar, (req, res) => {
  const { nome, quantidade, preco_unitario, data } = req.body ?? {};

  // Ticker: só letras e números, máximo 10 caracteres
  if (!nome || !/^[A-Z0-9]{1,10}$/.test(nome.toUpperCase().trim())) {
    return res.status(400).json({ erro: "Ticker inválido." });
  }

  // Quantidade: número positivo, máximo razoável
  if (!quantidade || quantidade <= 0 || quantidade > 1_000_000) {
    return res.status(400).json({ erro: "Quantidade inválida." });
  }

  // Preço: número positivo, máximo razoável
  if (!preco_unitario || preco_unitario <= 0 || preco_unitario > 10_000_000) {
    return res.status(400).json({ erro: "Preço inválido." });
  }

  // Data: formato YYYY-MM-DD válido
  if (!data || !validator.isDate(data, { format: "YYYY-MM-DD" })) {
    return res.status(400).json({ erro: "Data inválida. Use o formato YYYY-MM-DD." });
  }

  const ativo = buscarAtivoPorNome(nome);
  if (!ativo) {
    return res.status(404).json({ erro: `Ativo "${nome.toUpperCase()}" não está disponível.` });
  }

  // Limite de 40 ativos distintos por usuário
  // Verifica se o usuário já tem esse ativo
  // Se sim, é aporte em ativo existente (não conta)
  // Se não tem, verifica o limite de 40 ativos distintos
  const jaTemEsseAtivo = usuarioPossuiAtivo(req.usuario.sub, ativo.id);

  if (!jaTemEsseAtivo) {
    const totalAtivos = contarAtivosUsuario(req.usuario.sub);
    if (totalAtivos >= 40) {
      return res.status(400).json({ erro: "Limite de 40 ativos por carteira atingido." });
    }
  }

  const r = criarAporte(req.usuario.sub, ativo.id, quantidade, preco_unitario, data);
  res.status(201).json({ id: r.lastInsertRowid });
});

app.get("/api/aportes", autenticar, (req, res) => {
  res.json(listarAportes(req.usuario.sub));
});

app.delete("/api/aportes/:id", autenticar, (req, res) => {
  const r = deletarAporte(req.params.id, req.usuario.sub);

  if (r.changes === 0) {
    return res.status(404).json({ erro: "Aporte não encontrado ou não pertence a você." });
  }

  res.json({ ok: true });
});

app.get("/api/resumo/:ativo_id", autenticar, (req, res) => {
  const resumo = calcularResumoAtivo(req.params.ativo_id, req.usuario.sub);

  if (!resumo) {
    return res.status(404).json({ erro: "Ativo não encontrado." });
  }

  res.json(resumo);
});

app.get("/api/carteira", autenticar, (req, res) => {
  res.json(calcularCarteiraTotal(req.usuario.sub));
});

app.get("/api/carteira/resumo", autenticar, (req, res) => {
  const usuario_id = req.usuario.sub;

  // Busca todos os ativos que o usuário tem aportes
  const ativos = listarAtivos(usuario_id);

  if (ativos.length === 0) {
    return res.json({ ativos: [], patrimonio_total: 0 });
  }

  // Para cada ativo, calcula o resumo completo
  const resumos = ativos.map((ativo) =>
    calcularResumoAtivo(ativo.id, usuario_id)
  );

  const { valor_total } = calcularCarteiraTotal(usuario_id);

  return res.json({ ativos: resumos, patrimonio_total: valor_total });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});