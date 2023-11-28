import { CronJob } from "cron";
import { Channel, Client, Events, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

interface TimeCard {
  userId: string;
  startTime: Date;
  endTime: Date | null;
}

let timeCards: TimeCard[] = [];
const LETHAL_COMPANY_NAME = "Lethal Company";
const CHANNEL_ID = "293902684354904066";
let channel: Channel | null;

new CronJob(
  "0 * * * * 0",
  function () {
    const timeCardsThisWeek: TimeCard[] = [...timeCards].map((t) => ({
      userId: t.userId,
      startTime: t.startTime,
      endTime: t.endTime ?? new Date(),
    }));

    const newTimeCards: TimeCard[] = [...timeCards]
      .filter((t) => t.endTime === null)
      .map((t) => ({
        userId: t.userId,
        startTime: t.endTime!,
        endTime: null,
      }));
    timeCards = newTimeCards;

    const userIds = Array.from(new Set(timeCardsThisWeek.map((t) => t.userId)));

    const timeReports = userIds.map((userId) => {
      const userTimeCards = timeCardsThisWeek.filter(
        (t) => t.userId === userId
      );
      const hours = userTimeCards.reduce(
        (acc, curr) =>
          acc + (curr.endTime!.getTime() - curr.startTime.getTime()) / 3600000,
        0
      );

      return { userId, hours };
    });

    const message = timeReports
      .map((t) => `<@${t.userId}> worked ${t.hours} this week. \n`)
      .join("");
    sendMessage(message);
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
  } else {
    console.log("Channel is not text based.");
  }
}

client.on(Events.MessageCreate, (message) => {
  // console.log("on message");
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  channel = await client.channels.fetch(CHANNEL_ID);
});

client.on(Events.PresenceUpdate, async (oldMember, newMember) => {
  const currentTimeCard = timeCards.find(
    (t) => t.userId === newMember.userId && t.endTime === null
  );
  const isPlaying = newMember.activities.some(
    (a) => a.name === LETHAL_COMPANY_NAME
  );

  if (currentTimeCard && !isPlaying) {
    currentTimeCard.endTime = new Date();

    const hours =
      (currentTimeCard.endTime!.getTime() -
        currentTimeCard.startTime.getTime()) /
      3600000;

    let messageEnding = "";
    if (hours < 2) {
      messageEnding = "Pathetic.";
    } else if (hours < 4) {
      messageEnding = "Nice part time job.";
    } else if (hours < 6) {
      messageEnding = "Congrats on doing your job.";
    } else {
      messageEnding = "See you tomorrow.";
    }

    await sendMessage(
      `${newMember.user} has ended their shift after ${hours}. ${messageEnding}`
    );
    return;
  }

  if (!currentTimeCard && isPlaying) {
    timeCards.push({
      userId: newMember.userId,
      startTime: new Date(),
      endTime: null,
    });

    await sendMessage(`${newMember.user} has started their shift.`);
    return;
  }
});

// Log in to Discord with your client's token
client.login(process.env.token);
