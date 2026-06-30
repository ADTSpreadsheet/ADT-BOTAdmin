const line = require("@line/bot-sdk")

const adminLineClient = new line.Client({
  channelAccessToken: process.env.LINE_ADMIN_CHANNEL_ACCESS_TOKEN
})

async function pushToAdminGroup(message) {
  const groupId = process.env.LINE_ADMIN_GROUP_ID

  if (!groupId) {
    console.warn("LINE_ADMIN_GROUP_ID is missing")
    return
  }

  await adminLineClient.pushMessage(groupId, message)
}

module.exports = {
  pushToAdminGroup
}
