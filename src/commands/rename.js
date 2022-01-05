const Command = require('../modules/commands/command');
const {
	CommandInteraction, // eslint-disable-line no-unused-vars
	MessageEmbed
} = require('discord.js');

module.exports = class RenameCommand extends Command {
	constructor(client) {
		const i18n = client.i18n.getLocale(client.config.locale);
		super(client, {
			description: i18n('commands.rename.description'),
			internal: true,
			name: i18n('commands.rename.name'),
			options: [
				{
					description: i18n('commands.rename.options.name.description'),
					name: i18n('commands.rename.options.name.name'),
					required: true,
					type: Command.option_types.STRING
				},
				{
					description: i18n('commands.rename.options.ticket.description'),
					name: i18n('commands.rename.options.ticket.name'),
					required: false,
					type: Command.option_types.CHANNEL
				}
			]
		});
	}

	/**
	 * @param {CommandInteraction} interaction
	 * @returns {Promise<void|any>}
	 */
	async execute(interaction) {
		const settings = await this.client.utils.getSettings(interaction.guild.id);
		const default_i18n = this.client.i18n.getLocale(this.client.config.defaults.locale);  // command properties could be in a different locale
		const i18n = this.client.i18n.getLocale(settings.locale);

		const channel = interaction.options.getChannel(default_i18n('commands.rename.options.ticket.name')) ?? interaction.channel;
		const t_row = await this.client.tickets.resolve(channel.id, interaction.guild.id);

		if (!t_row) {
			return await interaction.reply({
				embeds: [
					new MessageEmbed()
						.setColor(settings.error_colour)
						.setTitle(i18n('commands.rename.response.not_a_ticket.title'))
						.setDescription(i18n('commands.rename.response.not_a_ticket.description'))
						.setFooter(settings.footer, interaction.guild.iconURL())
				],
				ephemeral: true
			});
		}

		const name = interaction.options.getString(default_i18n('commands.rename.options.name.name'));

		if (!name) {
			return await interaction.reply({
				embeds: [
					new MessageEmbed()
						.setColor(settings.error_colour)
						.setTitle(i18n('commands.rename.response.no_name.title'))
						.setDescription(i18n('commands.rename.response.no_name.description'))
						.setFooter(settings.footer, interaction.guild.iconURL())
				],
				ephemeral: true
			});
		}

		if (t_row.creator !== interaction.member.id && !await this.client.utils.isStaff(interaction.member)) {
			return await interaction.reply({
				embeds: [
					new MessageEmbed()
						.setColor(settings.error_colour)
						.setTitle(i18n('commands.rename.response.no_permission.title'))
						.setDescription(i18n('commands.rename.response.no_permission.description'))
						.setFooter(settings.footer, interaction.guild.iconURL())
				],
				ephemeral: true
			});
		}

		await interaction.reply({
			embeds: [
				new MessageEmbed()
					.setColor(settings.success_colour)
					.setAuthor(interaction.member.user.username, interaction.member.user.displayAvatarURL())
					.setTitle(i18n('commands.rename.response.renamed.title'))
					.setDescription(i18n('commands.rename.response.renamed.description', channel.name, name))
					.setFooter(settings.footer, interaction.guild.iconURL())
			],
			ephemeral: true
		});

		await channel.setName(name);

		await this.client.tickets.archives.updateChannel(channel.id, channel)

		this.client.log.info(`${interaction.user.tag} renamed ${channel.id} to ${name}`);
	}
};
