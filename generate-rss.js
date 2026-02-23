const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const RSS = require("rss");

const baseURL = "https://www.thedailystar.net";
const targetURL = "https://www.thedailystar.net/";
const flareSolverrURL = process.env.FLARESOLVERR_URL || "http://localhost:8191";

// Ensure feeds folder exists
fs.mkdirSync("./feeds", { recursive: true });

async function fetchWithFlareSolverr(url) {
  try {
    console.log(`Fetching ${url} via FlareSolverr...`);

    const response = await axios.post(
      `${flareSolverrURL}/v1`,
      {
        cmd: "request.get",
        url: url,
        maxTimeout: 60000
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 65000
      }
    );

    if (response.data && response.data.solution) {
      console.log("✅ FlareSolverr successfully bypassed protection");
      return response.data.solution.response;
    } else {
      throw new Error("FlareSolverr did not return a solution");
    }
  } catch (error) {
    console.error("❌ FlareSolverr error:", error.message);
    throw error;
  }
}

async function generateRSS() {
  try {
    // Fetch page content using FlareSolverr
    const htmlContent = await fetchWithFlareSolverr(targetURL);

    const $ = cheerio.load(htmlContent);
    const items = [];
    const seen = new Set(); // deduplicate by URL

    // Scrape ALL articles
    $("div.card").each((_, el) => {
      const $card = $(el);

      // Get title from h5.card-title or h1.card-title
      const titleElement = $card.find("h5.card-title a, h1.card-title a").first();
      const title = titleElement.text().trim();
      const href = titleElement.attr("href");

      if (!title || !href) return;

      const link = href.startsWith("http") ? href : baseURL + href;

      // Skip duplicates
      if (seen.has(link)) return;
      seen.add(link);

      // Get description/intro if available
      const intro = $card.find("div.card-intro").text().trim() ||
                    $card.find("p.intro").text().trim();

      // Get author if available
      const author = $card.find("div.author a").text().trim();

      // Get date if available
      const date = $card.find("div.card-info span").first().text().trim();

      const description = intro || (author ? `By ${author}` : "");

      items.push({
        title,
        link,
        description,
        author,
        date
      });
    });

    console.log(`Found ${items.length} articles`);

    // Fallback: dummy item if no articles found
    if (items.length === 0) {
      console.log("⚠️ No articles found, creating dummy item");
      items.push({
        title: "No articles found yet",
        link: baseURL,
        description: "RSS feed could not scrape any articles.",
        author: "",
        date: new Date().toUTCString()
      });
    }

    // Create RSS feed
    const feed = new RSS({
      title: "The Daily Star",
      description: "Latest news from The Daily Star",
      feed_url: `${baseURL}`,
      site_url: baseURL,
      language: "en",
      pubDate: new Date().toUTCString()
    });

    // Add ALL articles (no slice limit)
    items.forEach(item => {
      feed.item({
        title: item.title,
        url: item.link,
        description: item.description,
        author: item.author || undefined,
        date: item.date || new Date()
      });
    });

    // Write feed.xml
    const xml = feed.xml({ indent: true });
    fs.writeFileSync("./feeds/feed.xml", xml);
    console.log(`✅ RSS generated with ${items.length} items.`);
  } catch (err) {
    console.error("❌ Error generating RSS:", err.message);

    // Create dummy feed on error
    const feed = new RSS({
      title: "The Daily Star (dummy feed)",
      description: "RSS feed could not scrape, showing placeholder",
      feed_url: `${baseURL}`,
      site_url: baseURL,
      language: "en",
      pubDate: new Date().toUTCString()
    });
    feed.item({
      title: "Feed generation failed",
      url: baseURL,
      description: "An error occurred during scraping.",
      date: new Date()
    });
    fs.writeFileSync("./feeds/feed.xml", feed.xml({ indent: true }));
  }
}

generateRSS();
