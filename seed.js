import { criarAtivo } from "./database.js";

const ativos = [
  { nome: "PETR4", tipo: "ação", preco_atual: 38.50 },
  { nome: "VALE3", tipo: "ação", preco_atual: 61.20 },
  { nome: "ITUB4", tipo: "ação", preco_atual: 32.10 },
  { nome: "MXRF11", tipo: "FII", preco_atual: 10.15 },
  { nome: "HGLG11", tipo: "FII", preco_atual: 162.30 },
  { nome: "BTC", tipo: "criptomoeda", preco_atual: 350000.00 },
];

for (const ativo of ativos) {
  const resultado = criarAtivo(ativo.nome, ativo.tipo, ativo.preco_atual);
  console.log(`Ativo processado: ${resultado.nome}`);
}

console.log("Seed concluído.");