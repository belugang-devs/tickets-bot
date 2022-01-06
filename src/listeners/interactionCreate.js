const EventListener = require('../modules/listeners/listener');
const {
	Interaction, // eslint-disable-line no-unused-vars
	MessageActionRow,
	MessageButton,
	MessageEmbed
} = require('discord.js');

module.exports = class InteractionCreateEventListener extends EventListener {
	constructor(client) {
		super(client, { event: 'interactionCreate' });
	}

	/**
	 * @param {Interaction} interaction
	 */
	async execute(interaction) {
		this.client.log.debug(interaction);

		const settings = await this.client.utils.getSettings(interaction.guild.id);
		const i18n = this.client.i18n.getLocale(settings.locale);

		const blacklisted = settings.blacklist.members.includes[interaction.user.id] ||
			interaction.member?.roles.cache?.some(role => settings.blacklist.roles.includes(role));
		if (blacklisted) {
			return interaction.reply({
				content: i18n('blacklisted'),
				ephemeral: true
			});
		}

		const handlePanel = async id => {
			const cat_row = await this.client.db.models.Category.findOne({ where: { id } });

			if (!cat_row) {
				this.client.log.warn('Could not find a category with the ID given by a panel interaction');
				return interaction.reply({
					embeds: [
						new MessageEmbed()
							.setColor(settings.error_colour)
							.setTitle(i18n('command_execution_error.title'))
							.setDescription(i18n('command_execution_error.description'))
					],
					ephemeral: true
				});
			}

			const tickets = await this.client.db.models.Ticket.findAndCountAll({
				where: {
					category: cat_row.id,
					creator: interaction.user.id,
					open: true
				}
			});

			if (tickets.count >= cat_row.max_per_member) {
				if (cat_row.max_per_member === 1) {
					return interaction.reply({
						embeds: [
							new MessageEmbed()
								.setColor(settings.error_colour)
								.setAuthor(interaction.user.username, interaction.user.displayAvatarURL())
								.setTitle(i18n('commands.new.response.has_a_ticket.title'))
								.setDescription(i18n('commands.new.response.has_a_ticket.description', tickets.rows[0].id))
								.setFooter(settings.footer, interaction.guild.iconURL())
						],
						ephemeral: true
					});
				} else {
					const list = tickets.rows.map(row => {
						if (row.topic) {
							const description = row.topic.substring(0, 30);
							const ellipses = row.topic.length > 30 ? '...' : '';
							return `<#${row.id}>: \`${description}${ellipses}\``;
						} else {
							return `<#${row.id}>`;
						}
					});
					return interaction.reply({
						embeds: [
							new MessageEmbed()
								.setColor(settings.error_colour)
								.setAuthor(interaction.user.username, interaction.user.displayAvatarURL())
								.setTitle(i18n('commands.new.response.max_tickets.title', tickets.count))
								.setDescription(i18n('commands.new.response.max_tickets.description', list.join('\n')))
								.setFooter(settings.footer, interaction.guild.iconURL())
						],
						ephemeral: true
					});
				}
			} else {
				try {
					// const t_row = await this.client.tickets.create(interaction.guild.id, interaction.user.id, id);
					// return interaction.reply({
					// 	embeds: [
					// 		new MessageEmbed()
					// 			.setColor(settings.success_colour)
					// 			.setAuthor(interaction.user.username, interaction.user.displayAvatarURL())
					// 			.setTitle(i18n('commands.new.response.created.title'))
					// 			.setDescription(i18n('commands.new.response.created.description', `<#${t_row.id}>`))
					// 			.setFooter(settings.footer, interaction.guild.iconURL())
					// 	],
					// 	ephemeral: true
					// });
					return interaction.reply({
						embeds: [
							new MessageEmbed()
								.setColor("YELLOW")
								.setAuthor(interaction.user.username, interaction.user.displayAvatarURL())
								.setTitle(i18n('commands.new.response.confirm.title'))
								.setDescription(i18n('commands.new.response.confirm.description'))
								.setFooter(settings.footer, interaction.guild.iconURL())
						],
						components: [
							new MessageActionRow()
								.addComponents(
									new MessageButton()
										.setCustomId(`new_confirm:${id}`)
										.setLabel("Confirm")
										.setStyle("SECONDARY")										
								).addComponents(
									new MessageButton()
										.setCustomId(`new_cancel`)
										.setLabel("Cancel")
										.setStyle("SECONDARY")										
								)
						],
						ephemeral: true
					})
				} catch (error) {
					this.client.log.error(error);
					return interaction.reply({
						embeds: [
							new MessageEmbed()
								.setColor(settings.error_colour)
								.setAuthor(interaction.user.username, interaction.user.displayAvatarURL())
								.setTitle(i18n('commands.new.response.error.title'))
								.setDescription(error.message)
								.setFooter(settings.footer, interaction.guild.iconURL())
						],
						ephemeral: true
					});
				}
			}
		};

		if (interaction.isCommand()) {
			// handle slash commands
			this.client.commands.handle(interaction);
		} else if (interaction.isButton()) {
			if (interaction.customId.startsWith('panel.single')) {
				// handle single-category panels
				handlePanel(interaction.customId.split(':')[1]);
			} else if (interaction.customId.startsWith('ticket.claim')) {
				// handle ticket claiming
				if (!(await this.client.utils.isStaff(interaction.member))) return;
				const t_row = await this.client.db.models.Ticket.findOne({ where: { id: interaction.channel.id } });
				await t_row.update({ claimed_by: interaction.user.id });
				await interaction.channel.permissionOverwrites.edit(interaction.user.id, { VIEW_CHANNEL: true }, `Ticket claimed by ${interaction.user.tag}`);

				const cat_row = await this.client.db.models.Category.findOne({ where: { id: t_row.category } });

				for (const role of cat_row.roles) {
					await interaction.channel.permissionOverwrites.edit(role, { VIEW_CHANNEL: false }, `Ticket claimed by ${interaction.user.tag}`);
				}

				this.client.log.info(`${interaction.user.tag} has claimed "${interaction.channel.name}" in "${interaction.guild.name}"`);

				await interaction.reply({
					embeds: [
						new MessageEmbed()
							.setColor(settings.colour)
							.setAuthor(interaction.user.username, interaction.user.displayAvatarURL())
							.setTitle(i18n('ticket.claimed.title'))
							.setDescription(i18n('ticket.claimed.description', interaction.member.toString()))
							.setFooter(settings.footer, interaction.guild.iconURL())
					]
				});

				const components = new MessageActionRow();

				if (cat_row.claiming) {
					components.addComponents(
						new MessageButton()
							.setCustomId('ticket.unclaim')
							.setLabel(i18n('ticket.unclaim'))
							.setEmoji('♻️')
							.setStyle('SECONDARY')
					);
				}

				if (settings.close_button) {
					components.addComponents(
						new MessageButton()
							.setCustomId('ticket.close')
							.setLabel(i18n('ticket.close'))
							.setEmoji('✖️')
							.setStyle('DANGER')
					);
				}

				await interaction.message.edit({ components: [components] });
			} else if (interaction.customId.startsWith('ticket.unclaim')) {
				// handle ticket unclaiming
				if (!(await this.client.utils.isStaff(interaction.member))) return;
				const t_row = await this.client.db.models.Ticket.findOne({ where: { id: interaction.channel.id } });
				await t_row.update({ claimed_by: null });

				await interaction.channel.permissionOverwrites.delete(interaction.user.id, `Ticket released by ${interaction.user.tag}`);

				const cat_row = await this.client.db.models.Category.findOne({ where: { id: t_row.category } });

				for (const role of cat_row.roles) {
					await interaction.channel.permissionOverwrites.edit(role, { VIEW_CHANNEL: true }, `Ticket released by ${interaction.user.tag}`);
				}

				this.client.log.info(`${interaction.user.tag} has released "${interaction.channel.name}" in "${interaction.guild.name}"`);

				await interaction.reply({
					embeds: [
						new MessageEmbed()
							.setColor(settings.colour)
							.setAuthor(interaction.user.username, interaction.user.displayAvatarURL())
							.setTitle(i18n('ticket.released.title'))
							.setDescription(i18n('ticket.released.description', interaction.member.toString()))
							.setFooter(settings.footer, interaction.guild.iconURL())
					]
				});

				const components = new MessageActionRow();

				if (cat_row.claiming) {
					components.addComponents(
						new MessageButton()
							.setCustomId('ticket.claim')
							.setLabel(i18n('ticket.claim'))
							.setEmoji('🙌')
							.setStyle('SECONDARY')
					);
				}

				if (settings.close_button) {
					components.addComponents(
						new MessageButton()
							.setCustomId('ticket.close')
							.setLabel(i18n('ticket.close'))
							.setEmoji('✖️')
							.setStyle('DANGER')
					);
				}

				await interaction.message.edit({ components: [components] });
			} else if (interaction.customId.startsWith('ticket.close')) {
				// handle ticket close button
				const t_row = await this.client.db.models.Ticket.findOne({ where: { id: interaction.channel.id } });
				if (!await this.client.utils.isStaff(interaction.member)) {
					return
				}
				await interaction.reply({
					components: [
						new MessageActionRow()
							.addComponents(
								new MessageButton()
									.setCustomId(`confirm_close:${interaction.id}`)
									.setLabel(i18n('commands.close.response.confirm.buttons.confirm'))
									.setEmoji('✅')
									.setStyle('SUCCESS')
							)
							.addComponents(
								new MessageButton()
									.setCustomId(`cancel_close:${interaction.id}`)
									.setLabel(i18n('commands.close.response.confirm.buttons.cancel'))
									.setEmoji('❌')
									.setStyle('SECONDARY')
							)
					],
					embeds: [
						new MessageEmbed()
							.setColor(settings.colour)
							.setTitle(i18n('commands.close.response.confirm.title'))
							.setDescription(settings.log_messages ? i18n('commands.close.response.confirm.description_with_archive') : i18n('commands.close.response.confirm.description'))
							.setFooter(this.client.utils.footer(settings.footer, i18n('collector_expires_in', 30)), interaction.guild.iconURL())
					],
					ephemeral: true
				});


				const filter = i => i.user.id === interaction.user.id && i.customId.includes(interaction.id);
				const collector = interaction.channel.createMessageComponentCollector({
					filter,
					time: 30000
				});

				collector.on('collect', async i => {
					await i.deferUpdate();

					if (i.customId === `confirm_close:${interaction.id}`) {
						// await this.client.tickets.close(t_row.id, interaction.user.id, interaction.guild.id);
						// await i.editReply({
						// 	components: [],
						// 	embeds: [
						// 		new MessageEmbed()
						// 			.setColor(settings.success_colour)
						// 			.setTitle(i18n('commands.close.response.closed.title', t_row.number))
						// 			.setDescription(i18n('commands.close.response.closed.description', t_row.number))
						// 			.setFooter(settings.footer, interaction.guild.iconURL())
						// 	],
						// 	ephemeral: true
						// });
						await i.editReply({
							content: `Ticket closed by <@${i.user.id}>`
						})
						await i.channel.send({
							content: `Ticket closed by <@${i.user.id}>`,
							embeds: [
								new MessageEmbed()
									.setColor("RED")
									.setDescription("```Support team controls```")
							],
							components: [
								new MessageActionRow()
									.addComponents(
										new MessageButton({
											customId: `ticket_delete:${t_row.id}`,
											style: "DANGER",
											label: "Delete",
											emoji: "⛔"
										})
									)
									.addComponents(
										new MessageButton({
											customId: `ticket_reopen:${t_row.id}`,
											style: "SUCCESS",
											label: "Open",
											emoji: "🔓"
										})
									)
							]
						});
						if (i.channel.type == "GUILD_TEXT") {
							await i.channel.permissionOverwrites.edit(t_row.creator, {
								VIEW_CHANNEL: false,
								SEND_MESSAGES: false
							})
						}
						
					} else {
						await i.editReply({
							components: [],
							embeds: [
								new MessageEmbed()
									.setColor(settings.error_colour)
									.setTitle(i18n('commands.close.response.canceled.title'))
									.setDescription(i18n('commands.close.response.canceled.description'))
									.setFooter(settings.footer, interaction.guild.iconURL())
							],
							ephemeral: true
						});
					}

					collector.stop();
				});

				collector.on('end', async collected => {
					if (collected.size === 0) {
						await interaction.editReply({
							components: [],
							embeds: [
								new MessageEmbed()
									.setColor(settings.error_colour)
									.setAuthor(interaction.user.username, interaction.user.displayAvatarURL())
									.setTitle(i18n('commands.close.response.confirmation_timeout.title'))
									.setDescription(i18n('commands.close.response.confirmation_timeout.description'))
									.setFooter(settings.footer, interaction.guild.iconURL())
							],
							ephemeral: true
						});
					}
				});
			} else if (interaction.customId.startsWith("ticket_delete")) {
				await interaction.deferUpdate();
				const t_row = await this.client.db.models.Ticket.findOne({ where: { id: interaction.channel.id } });
				await this.client.tickets.close(t_row.id, interaction.user.id, interaction.guild.id);
			} else if (interaction.customId.startsWith("ticket_reopen")) {
				this.client.log.error("PAT")
				await interaction.deferUpdate();
				const pinned = await interaction.channel.messages.fetchPinned();
				const t_row = await this.client.db.models.Ticket.findOne({ where: { id: interaction.channel.id } });
			await t_row.update({
				closed_by: null,
				closed_reason: null,
				open: true,
				pinned_messages: [...pinned.keys()]
			});
			if (interaction.channel.type == "GUILD_TEXT") {
				await interaction.channel.permissionOverwrites.edit(t_row.creator, {
					VIEW_CHANNEL: true,
					SEND_MESSAGES: true
				})
			}
			await interaction.editReply({
				content: `Ticket reopened by <@${interaction.user.id}>`
			})
			await interaction.message.delete()
			}
			else if(interaction.customId.startsWith("new_confirm")) {
				try {
					const id = interaction.customId.split(":")[1]
					const t_row = await this.client.tickets.create(interaction.guild.id, interaction.user.id, id);
					return interaction.update({
						data: {
						embeds: [
							new MessageEmbed()
								.setColor(settings.success_colour)
								.setAuthor(interaction.user.username, interaction.user.displayAvatarURL())
								.setTitle(i18n('commands.new.response.created.title'))
								.setDescription(i18n('commands.new.response.created.description', `<#${t_row.id}>`))
								.setFooter(settings.footer, interaction.guild.iconURL())
						],
						components: []
					},
						ephemeral: true
					});
					// return interaction.reply({
					// 	embeds: [
					// 		new MessageEmbed()
					// 			.setColor("YELLOW")
					// 			.setAuthor(interaction.user.username, interaction.user.displayAvatarURL())
					// 			.setTitle(i18n('commands.new.response.confirm.title'))
					// 			.setDescription(i18n('commands.new.response.confirm.description'))
					// 			.setFooter(settings.footer, interaction.guild.iconURL())
					// 	],
					// 	components: [
					// 		new MessageActionRow()
					// 			.addComponents(
					// 				new MessageButton()
					// 					.setCustomId(`new_confirm:${interaction.guild.id}:${interaction.user.id}:${id}`)
					// 					.setLabel("Confirm")
					// 					.setStyle("SECONDARY")										
					// 			).addComponents(
					// 				new MessageButton()
					// 					.setCustomId(`new_cancel`)
					// 					.setLabel("Cancel")
					// 					.setStyle("SECONDARY")										
					// 			)
					// 	],
					// 	ephemeral: true
					// })
				} catch (error) {
					this.client.log.error(error);
					return interaction.reply({
						embeds: [
							new MessageEmbed()
								.setColor(settings.error_colour)
								.setAuthor(interaction.user.username, interaction.user.displayAvatarURL())
								.setTitle(i18n('commands.new.response.error.title'))
								.setDescription(error.message)
								.setFooter(settings.footer, interaction.guild.iconURL())
						],
						ephemeral: true
					});
				}
			} else if(interaction.customId.startsWith("new_cancel")) {
				await interaction.update({
					data: {
						content: "Cancelled the ticket",
						components: [],
						embeds: []
					},
					ephemeral: true
				})
			}
		} else if (interaction.isSelectMenu()) {
			if (interaction.customId.startsWith('panel.multiple')) {
				// handle multi-category panels and new command
				handlePanel(interaction.values[0]);
			}
		}
	}
};