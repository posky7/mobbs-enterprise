export default async function handler(event, context) {
  try {
    const timestamp = new Date().toISOString();
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Backup timestamp generated",
        timestamp: timestamp,
        success: true
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to generate timestamp" })
    };
  }
}