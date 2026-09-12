const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");
require("dotenv").config();

const fs = require("fs");
const path = require("path");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const PREFIX_CMD = ".";
const BOT_PING_MESSAGE = "Kiss 4zx {user}";

// Definisi command role: .org, .adm, .hmod, .mod, .ref, .bot, .cast
// Ubah "prefix" di sini kalau mau tampilan nickname yang berbeda.
const ROLE_COMMANDS = {
  org:  { configKey: "orgRoleId",  prefix: "𝗢𝗥𝗚| " },
  mod:  { configKey: "modRoleId",  prefix: "𝗠𝗢𝗗 | " },
  ref:  { configKey: "refRoleId",  prefix: "𝗥𝗘𝗙 | " },
  bot:  { configKey: "botRoleId",  prefix: "𝗕𝗢𝗧 | " },
  cast: { configKey: "castRoleId", prefix: "𝗖𝗔𝗦𝗧 | " }
};

const CONFIG_PATH = path.join(__dirname, "config.json");

let config = {};
if (fs.existsSync(CONFIG_PATH)) {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

// roleConfig[configKey] = roleId yang tersimpan (bisa null kalau belum di-set)
const roleConfig = {};
for (const { configKey } of Object.values(ROLE_COMMANDS)) {
  roleConfig[configKey] = config[configKey] || null;
}

function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(roleConfig, null, 2));
}

function actionEmbed(client, success, description) {
  return new EmbedBuilder()
    .setColor(success ? 0x2ecc71 : 0xe74c3c)
    .setAuthor({
      name: client.user.username,
      iconURL: client.user.displayAvatarURL()
    })
    .setTitle(`${success ? "✅" : "❌"} Action Result`)
    .setDescription(description)
    .setFooter({
      text: client.user.username,
      iconURL: client.user.displayAvatarURL()
    })
    .setTimestamp();
}

async function changeNickname(message, prefix, suffix = "", roleId = null) {
  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
    return message.reply({
      embeds: [actionEmbed(client, false, "You don't have permission.")]
    });
  }

  const member = message.mentions.members.first();
  if (!member) {
    return message.reply({
      embeds: [actionEmbed(client, false, "Mention a user.")]
    });
  }

  let customName = message.content
    .replace(`${PREFIX_CMD}${message.content.split(" ")[0].substring(1)}`, "")
    .replace(`<@!${member.id}>`, "")
    .replace(`<@${member.id}>`, "")
    .trim();

  if (!customName) {
    return message.reply({
      embeds: [actionEmbed(client, false, "Choose a name.")]
    });
  }

  let finalNick = `${prefix}${customName}${suffix}`;

  // Discord membatasi nickname maksimal 32 karakter.
  if (finalNick.length > 32) {
    finalNick = finalNick.slice(0, 32);
  }

  try {
    await member.setNickname(finalNick);

    if (roleId && !member.roles.cache.has(roleId)) {
      await member.roles.add(roleId);
    }

    message.reply({
      embeds: [
        actionEmbed(
          client,
          true,
          `Nickname set to **${finalNick}**` +
          (roleId ? "\nRole added." : "")
        )
      ]
    });
  } catch {
    message.reply({
      embeds: [actionEmbed(client, false, "Action failed.")]
    });
  }
}

client.once("ready", () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  registerSlashCommand();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Guard DM: message.member bernilai null di DM, tanpa ini bot akan crash.
  if (!message.guild || !message.member) return;

  if (
    message.mentions.has(client.user) &&
    message.mentions.users.size === 1
  ) {
    const replyMessage = BOT_PING_MESSAGE.replace(
      "{user}",
      `<@${message.author.id}>`
    );

    return message.reply(`***${replyMessage}***`);
  }

  if (!message.content.startsWith(PREFIX_CMD)) return;

  const command = message.content
    .slice(PREFIX_CMD.length)
    .trim()
    .split(/ +/)[0]
    .toLowerCase();

  // .org, .adm, .hmod, .mod, .ref, .bot, .cast — masing-masing punya role & config sendiri
  if (ROLE_COMMANDS[command]) {
    const { configKey, prefix } = ROLE_COMMANDS[command];
    const roleId = roleConfig[configKey];

    if (!roleId) {
      return message.reply({
        embeds: [actionEmbed(client, false, `Use \`/set_${command}_role\` first.`)]
      });
    }

    await changeNickname(message, prefix, "", roleId);
    return;
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!interaction.member) {
    return interaction.reply({
      embeds: [actionEmbed(client, false, "This command must be used in a server.")],
      ephemeral: true
    });
  }

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({
      embeds: [actionEmbed(client, false, "Admin only.")],
      ephemeral: true
    });
  }

  for (const [command, { configKey }] of Object.entries(ROLE_COMMANDS)) {
    if (interaction.commandName === `set_${command}_role`) {
      const role = interaction.options.getRole("role");
      roleConfig[configKey] = role.id;
      saveConfig();

      return interaction.reply({
        embeds: [actionEmbed(client, true, `${command.toUpperCase()} role set to **${role.name}**.`)]
      });
    }
  }
});

async function registerSlashCommand() {
  const commands = Object.keys(ROLE_COMMANDS).map(command =>
    new SlashCommandBuilder()
      .setName(`set_${command}_role`)
      .setDescription(`Define ${command.toUpperCase()} role`)
      .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true))
      .toJSON()
  );

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
    { body: commands }
  );
}

client.login(process.env.DISCORD_TOKEN);
