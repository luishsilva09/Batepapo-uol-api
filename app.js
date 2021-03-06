import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import dayjs from "dayjs";
import cors from "cors";
import joi from "joi";

dotenv.config();

const MAX_TEMPO_INATIVO = 10000;
let listaParticipantes = [];

const client = new MongoClient(process.env.URL_CONECT_MONGO);
let db;
client.connect().then(() => {
  db = client.db("batepapo-uol-api");
});

const app = express();
app.use(express.json());
app.use(cors());

// valiadar usuario
const participantesSchema = joi.object({
  name: joi.string().trim().required(),
});

function now() {
  return dayjs().format("HH:mm:ss");
}
async function atualizarLista() {
  const users = await db.collection("participantes").find().toArray();
  listaParticipantes = [];
  users.filter((e) => {
    listaParticipantes.push(e.name);
    return true;
  });
}

// validar mensagem enviada
const mensagemSchema = joi.object({
  from: joi
    .string()
    .custom((value, helpers) => {
      if (!listaParticipantes.includes(value)) {
        return helpers.error(422);
      }
      return value;
    })
    .required(),
  to: joi.string().trim().required(),
  text: joi.string().trim().required(),
  type: joi.string().valid("message", "private_message"),
  time: joi.string().required(),
});

// entrar
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
        time: now(),
      });
      response.sendStatus(201);
    }
  } catch (error) {
    response.sendStatus(500);
  }
});

// buscar lisata de participantes
app.get("/participants", async (request, response) => {
  try {
    const Participantes = await db.collection("participantes").find().toArray();
    response.send(Participantes);
  } catch (error) {
    response.sendStatus(500);
  }
});

// enviar mensagem
app.post("/messages", async (request, response) => {
  try {
    await atualizarLista();

    const dados = {
      from: request.headers.user,
      to: request.body.to,
      text: request.body.text,
      type: request.body.type,
      time: now(),
    };

    const valida = mensagemSchema.validate(dados, {
      abortEarly: false,
    });
    if (valida.error) {
      response.sendStatus(422);
    } else {
      await db.collection("mensagem").insertOne(dados);
      response.sendStatus(201);
    }
  } catch (error) {
    response.sendStatus(500);
  }
});

// buscar mensagens
app.get("/messages", async (request, response) => {
  try {
    const { limit } = request.query;
    const mensagem = await db.collection("mensagem").find().toArray();
    const mensagens = mensagem
      .reverse()
      .filter(
        (elemento) =>
          elemento.to === "Todos" ||
          elemento.type === "message" ||
          elemento.to === request.headers.user ||
          elemento.from === request.headers.user
      );
    if (limit) {
      const render = [];
      for (let i = 0; i < limit; i += 1) {
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

// verificar se usuario esta online
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
        .updateOne(
          { _id: usuarioNaLista._id },
          { $set: { lastStatus: Date.now() } }
        );
      response.sendStatus(200);
    }
  } catch (error) {
    response.sendStatus(500);
  }
});

async function editarOuDeletar(acao, usuario, id, dados) {
  const existeMensagem = await db
    .collection("mensagem")
    .findOne({ _id: new ObjectId(id) });

  if (existeMensagem && existeMensagem.from === usuario && acao === "put") {
    await db
      .collection("mensagem")
      .updateOne({ _id: new ObjectId(id) }, { $set: dados });
    return 200;
  }
  if (existeMensagem && existeMensagem.from === usuario && acao === "delete") {
    await db.collection("mensagem").deleteOne({ _id: new ObjectId(id) });
    return 200;
  }
  if (existeMensagem.from !== usuario) {
    return 401;
  }
  return 404;
}

// deletar mensagem
app.delete("/messages/:id", async (request, response) => {
  try {
    const usuario = request.headers.user;
    const { id } = request.params;
    const resposta = await editarOuDeletar("delete", usuario, id);
    response.sendStatus(resposta);
  } catch (error) {
    response.sendStatus(500);
  }
});

// atualizar menssagem
app.put("/messages/:id", async (request, response) => {
  try {
    await atualizarLista();
    const usuario = request.headers.user;
    const { id } = request.params;
    const dados = {
      from: request.headers.user,
      to: request.body.to,
      text: request.body.text,
      type: request.body.type,
      time: now(),
    };

    const valida = mensagemSchema.validate(dados, {
      abortEarly: false,
    });
    if (valida.error) {
      response.sendStatus(422);
      return;
    }

    const resposta = await editarOuDeletar("put", usuario, id, dados);
    response.sendStatus(resposta);
  } catch {
    response.sendStatus(500);
  }
});

// usuario inativo
setInterval(async () => {
  const participantes = await db.collection("participantes").find().toArray();
  participantes.map((participante) => {
    const tempoInativo = Date.now() - participante.lastStatus;
    if (tempoInativo > MAX_TEMPO_INATIVO) {
      db.collection("participantes").deleteOne({ name: participante.name });

      db.collection("mensagem").insertOne({
        from: participante.name,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: now(),
      });
    }
    return true;
  });
}, 15000);

app.listen(process.env.PORT, () => console.log("Servidor online"));
