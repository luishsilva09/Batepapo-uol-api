import express from "express";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import dayjs from "dayjs";

dotenv.config();
let now = dayjs().format("HH:mm:ss");

const client = new MongoClient(process.env.URL_CONECT_MONGO);
let db;
client.connect().then(() => {
  db = client.db("batepapo-uol-api");
});

const app = express();
app.use(express.json());

app.post("/participants", (request, response) => {
  //verifica se já existe o usuario
  db.collection("participantes")
    .findOne({ name: request.body.name })
    .then((find) => cadastro(find));

  function cadastro(find) {
    if (find) {
      response.sendStatus(409);
    } else {
      //salva o dado no banco
      db.collection("participantes").insertOne({
        name: request.body.name,
        lastStatus: Date.now(),
      });

      db.collection("mensagem").insertOne({
        from: request.body.name,
        to: "Todos",
        text: "entra na sala...",
        type: "status",
        time: now,
      });
      response.sendStatus(201);
    }
  }
});

app.get("/participants", (request, response) => {
  db.collection("participantes")
    .find()
    .toArray()
    .then((contatos) => response.send(contatos));
});

app.post("/messages", (request, response) => {
  db.collection("mensagem")
    .insertOne({
      from: request.headers.user,
      to: request.body.to,
      text: request.body.text,
      type: request.body.type,
      time: now,
    })
    .then(() => response.sendStatus(201));
});

app.get("/messages", (request, response) => {
  let limit = request.query.limit;

  db.collection("mensagem")
    .find()
    .toArray()
    .then((mensagem) => exibirMensagem(mensagem));

  function exibirMensagem(mensagem) {
    let mensagens = mensagem
      .reverse()
      .filter(
        (elemento) =>
          elemento.to === "Todos" || elemento.to === request.headers.user
      );
    console.log(mensagens);
    if (limit) {
      let render = [];
      for (let i = 0; i < limit; i++) {
        if (mensagens[i] == null) break;
        render.push(mensagens[i]);
      }
      response.send(render);
    } else {
      response.send(mensagens);
    }
  }
});

app.listen(process.env.PORT, () => console.log("Servidor online"));
