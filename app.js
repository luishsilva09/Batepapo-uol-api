import express from "express";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import dayjs from "dayjs";
import cors from "cors";
import joi from "joi";

dotenv.config();
let now = dayjs().format("HH:mm:ss");
const MAX_TEMPO_INATIVO = 10000;

const client = new MongoClient(process.env.URL_CONECT_MONGO);
let db;
client.connect().then(() => {
  db = client.db("batepapo-uol-api");
});

const app = express();
app.use(express.json());
app.use(cors());

const participantesSchema = joi.object({
  name: joi.string().required(),
});

app.post("/participants", async (request, response) => {
  try {
    const valida = participantesSchema.validate(request.body);
    if (valida.error) {
      response.sendStatus(422);
      return;
    }

    const usuarioExistente = await db
      .collection("participantes")
      .findOne({ name: request.body.name });

    if (usuarioExistente) {
      response.sendStatus(409);
    } else {
      await db.collection("participantes").insertOne({
        name: request.body.name,
        lastStatus: Date.now(),
      });

      await db.collection("mensagem").insertOne({
        from: request.body.name,
        to: "Todos",
        text: "entra na sala...",
        type: "status",
        time: now,
      });
      response.sendStatus(201);
    }
  } catch (error) {
    response.sendStatus(500);
  }
});

app.get("/participants", async (request, response) => {
  try {
    const listaParticipantes = await db
      .collection("participantes")
      .find()
      .toArray();
    response.send(listaParticipantes);
  } catch (error) {
    response.sendStatus(500);
  }
});

app.post("/messages", async (request, response) => {
  try {
    await db.collection("mensagem").insertOne({
      from: request.headers.user,
      to: request.body.to,
      text: request.body.text,
      type: request.body.type,
      time: now,
    });
    response.sendStatus(201);
  } catch (error) {
    response.sendStatus(500);
  }
});

app.get("/messages", async (request, response) => {
  try {
    let limit = request.query.limit;
    const mensagem = await db.collection("mensagem").find().toArray();
    let mensagens = mensagem
      .reverse()
      .filter(
        (elemento) =>
          elemento.to === "Todos" ||
          elemento.to === request.headers.user ||
          elemento.from === request.headers.user
      );
    if (limit) {
      let render = [];
      for (let i = 0; i < limit; i++) {
        if (mensagens[i] == null) break;
        render.unshift(mensagens[i]);
      }
      response.send(render);
    } else {
      response.send(mensagens.reverse());
    }
  } catch (error) {
    response.sendStatus(500);
  }
});

app.post("/status", async (request, response) => {
  try {
    const usuario = request.headers.user;
    const usuarioNaLista = await db
      .collection("participantes")
      .findOne({ name: usuario });
    if (!usuarioNaLista) {
      response.sendStatus(404);
    } else {
      await db
        .collection("participantes")
        .findOneAndUpdate(
          { name: usuario },
          { $set: { lastStatus: Date.now() } }
        );
      response.sendStatus(200);
    }
  } catch (error) {
    response.sendStatus(500);
  }
});

//usuario inativo
setInterval(async () => {
  const listaParticipantes = await db
    .collection("participantes")
    .find()
    .toArray();
  listaParticipantes.map((participante) => {
    let tempoInativo = Date.now() - participante.lastStatus;
    if (tempoInativo > MAX_TEMPO_INATIVO) {
      db.collection("participantes").deleteOne({ name: participante.name });
      db.collection("mensagem").insertOne({
        from: participante.name,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: now,
      });
    }
  });
}, 15000);

app.listen(process.env.PORT, () => console.log("Servidor online"));
