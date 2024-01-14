import { CronJob } from "cron";
import {
  Channel,
  Client,
  Events,
  GatewayIntentBits,
  Presence,
} from "discord.js";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();
const LETHAL_COMPANY_NAME = "Lethal Company";
const CHANNEL_ID = "293902684354904066";
let channel: Channel | null;

new CronJob(
  "0 0 0 * * 0",
  // "0 * * * * *",
  async function () {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const thisWeek = await prisma.timeCard.findMany({
      where: {
        startTime: {
          gt: oneWeekAgo,
        },
      },
    });

    const now = new Date();
    const nonEnded = await prisma.timeCard.findMany({
      where: { endTime: null },
    });
    await prisma.timeCard.updateMany({
      where: { endTime: null },
      data: { endTime: now },
    });
    nonEnded.map(
      async (t) =>
        await prisma.timeCard.create({
          data: { userId: t.userId, startTime: now, endTime: null },
        })
    );

    const userIds = Array.from(new Set(thisWeek.map((t) => t.userId)));
    const timeReports = userIds.map((userId) => {
      const userTimeCards = thisWeek.filter((t) => t.userId === userId);
      const hours = userTimeCards.reduce(
        (acc, curr) =>
          acc +
          ((curr.endTime.getTime() ?? Date.now()) - curr.startTime.getTime()) /
            3600000,
        0
      );
      return { userId, hours };
    });
    const message = timeReports
      .map(
        (t) =>
          `<@${t.userId}> worked ${t.hours.toFixed(
            1
          )} hours this week. Rank: ${hoursToTitle(t.hours)} \n`
      )
      .join("");

    const header = "Last weeks time report: \n";
    sendMessage(header + message);
  },
  null,
  true,
  "America/Los_Angeles"
);

new CronJob(
  "0 0 11 * * 0",
  async function () {
    sendMessage(
      "Attention Lethal Company. This is Carol, 10 year associate, signing out. Goodnight."
    );
  },
  null,
  true,
  "America/Los_Angeles"
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
  ],
});

async function sendMessage(message: string): Promise<void> {
  if (channel?.isTextBased()) {
    await channel.send(message);
    // console.log({ message });
  } else {
    console.log("Channel is not text based.");
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  channel = await client.channels.fetch(CHANNEL_ID);
});

client.on(Events.PresenceUpdate, handlePresenceUpdate);

// Log in to Discord with your client's token
client.login(process.env.token);

async function handlePresenceUpdate(
  _: Presence,
  presence: Presence
): Promise<void> {
  const currentTimeCard = await prisma.timeCard.findFirst({
    where: { userId: presence.userId, endTime: null },
  });
  const isPlaying = presence.activities.some(
    (a) => a.name === LETHAL_COMPANY_NAME
  );

  if (currentTimeCard && !isPlaying) {
    await prisma.timeCard.update({
      where: { id: currentTimeCard.id },
      data: { endTime: new Date() },
    });

    const hours = (Date.now() - currentTimeCard.startTime.getTime()) / 3600000;

    let messageEnding: string;
    if (hours < 1) {
      messageEnding = "Pathetic.";
    } else if (hours < 2) {
      messageEnding = "Nice part time job.";
    } else if (hours < 3) {
      messageEnding = "Congrats on doing your job.";
    } else {
      messageEnding = "See you tomorrow.";
    }

    await sendMessage(
      `${presence.user} has clocked out after ${hours.toFixed(
        1
      )} hours. ${messageEnding}`
    );
    return;
  }

  if (!currentTimeCard && isPlaying) {
    await prisma.timeCard.create({
      data: {
        userId: presence.userId,
        startTime: new Date(),
        endTime: null,
      },
    });

    await sendMessage(`${presence.user} has clocked in.`);
    return;
  }
}

function hoursToTitle(hours: number): string {
  if (hours < 3) {
    return "Intern";
  } else if (hours < 6) {
    return "Part-Time";
  } else if (hours < 9) {
    return "Employee";
  } else if (hours < 12) {
    return "Leader";
  } else {
    return "Boss";
  }
}
