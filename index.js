import express from 'express';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

const PORT = process.env.PORT || 3000;
const MAX_KEYWORD_LENGTH = 50;
const KEYWORD_REGEX = /^[\w\s-]+$/;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CORS_ORIGIN = ['http://localhost:3000']; // Restrict to allowed origins

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class KeywordValidator {
  static validate(keyword) {
    if (!keyword) throw new ValidationError('Keyword is required');
    if (keyword.length > MAX_KEYWORD_LENGTH)
      throw new ValidationError(`Keyword must be at most ${MAX_KEYWORD_LENGTH} characters`);
    if (!KEYWORD_REGEX.test(keyword))
      throw new ValidationError('Keyword contains invalid characters');
    return keyword.trim();
  }
}

class AmazonUrlBuilder {
  build(keyword) {
    return `https://www.amazon.com/s?k=${encodeURIComponent(keyword)}`;
  }
}

class AmazonHttpClient {
  constructor(userAgent, maxRetries = 3, retryDelay = 1000) {
    this.userAgent = userAgent;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  async fetchHtml(url) {
    let attempt = 0;
    while (attempt <= this.maxRetries) {
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: 10000,
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400,
          responseType: 'text',
          maxContentLength: 2_000_000,
        });
        return response.data;
      } catch (err) {
        const status = err.response?.status;
        if (status && status >= 300 && status < 400) {
          throw new Error(`Redirect blocked (status ${status})`);
        }
        if (status === 503) {
          attempt++;
          if (attempt > this.maxRetries) {
            throw new Error(`Failed after ${this.maxRetries} retries: ${err.message}`);
          }
          await new Promise((r) => setTimeout(r, this.retryDelay * attempt));
          continue;
        }
        throw new Error(`Failed to fetch HTML: ${err.response?.status || err.message}`);
      }
    }
  }
}

class AmazonHtmlParser {
  parse(html) {
    const dom = new JSDOM(html);
    const items = dom.window.document.querySelectorAll('[data-component-type="s-search-result"]');
    return Array.from(items)
      .slice(0, 20)
      .map((item) => ({
        title: this.getTitle(item),
        rating: this.getRating(item),
        reviews: this.getReviews(item),
        image: this.getImage(item),
      }));
  }

  getTitle(item) {
    return item.querySelector('h2 span')?.textContent?.trim() || null;
  }

  getRating(item) {
    const el = item.querySelector('.a-icon-alt');
    const text = el?.textContent || '';
    const match = text.match(/([0-9.]+)\s+out of/);
    return match ? parseFloat(match[1]) : null;
  }

  getReviews(item) {
    const el = item.querySelector('[aria-label*="ratings"]');
    const text = el?.textContent?.replace(/[^\d]/g, '');
    return text ? parseInt(text, 10) : null;
  }

  getImage(item) {
    return item.querySelector('img.s-image')?.src || null;
  }
}

class Cache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  get(key) {
    const cached = this.store.get(key);
    if (!cached) return null;
    if (cached.expiry < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return cached.value;
  }

  set(key, value) {
    this.store.set(key, { value, expiry: Date.now() + this.ttlMs });
  }
}

class AmazonScraperService {
  constructor(urlBuilder, httpClient, parser, cache) {
    this.urlBuilder = urlBuilder;
    this.httpClient = httpClient;
    this.parser = parser;
    this.cache = cache;
  }

  async scrape(keyword) {
    const validatedKeyword = KeywordValidator.validate(keyword);
    const cached = this.cache.get(validatedKeyword);
    if (cached) {
      console.log(`[CACHE HIT] Keyword: ${validatedKeyword}`);
      return cached;
    }
    console.log(`[CACHE MISS] Fetching keyword: ${validatedKeyword}`);
    const url = this.urlBuilder.build(validatedKeyword);
    const html = await this.httpClient.fetchHtml(url);
    const parsed = this.parser.parse(html);
    this.cache.set(validatedKeyword, parsed);
    return parsed;
  }
}

class ScrapeRouter {
  constructor(scraperService) {
    this.router = express.Router();
    this.router.get('/', this.handleScrape.bind(this, scraperService));
  }

  async handleScrape(scraperService, req, res, next) {
    try {
      const keyword = String(req.query.keyword || '').trim();
      const results = await scraperService.scrape(keyword);
      res.json({ keyword, count: results.length, results });
    } catch (err) {
      next(err);
    }
  }
}

function errorHandler(err, req, res, next) {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  console.error('[ERROR]', err);
  res.status(503).json({ error: 'Internal server error' });
}

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: CORS_ORIGIN,
  })
);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/scrape', limiter);

app.get('/', (_, res) => {
  res.send(`
    <html>
      <head>
        <title>Amazon Scraper API</title>
        <style>
          body { font-family: sans-serif; padding: 2rem; max-width: 800px; margin: auto; }
          code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h1>Amazon Scraper API</h1>
        <p>This API scrapes public product listings from Amazon based on a search keyword.</p>
        <h2>Usage</h2>
        <p>Send a <code>GET</code> request to:</p>
        <pre><code>/api/scrape?keyword=your+search+term</code></pre>
        <h3>Example:</h3>
        <pre><code>/api/scrape?keyword=usb+charger</code></pre>
        <h3>Response:</h3>
        <pre><code>{
  "keyword": "usb charger",
  "count": 20,
  "results": [
    {
      "title": "Example USB Charger",
      "rating": 4.5,
      "reviews": 1234,
      "image": "https://..."
    },
    ...
  ]
}</code></pre>
      </body>
    </html>
  `);
});

const urlBuilder = new AmazonUrlBuilder();
const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
const httpClient = new AmazonHttpClient(userAgent);
const parser = new AmazonHtmlParser();
const cache = new Cache(CACHE_TTL_MS);
const scraperService = new AmazonScraperService(urlBuilder, httpClient, parser, cache);
const scrapeRouter = new ScrapeRouter(scraperService);

app.use('/api/scrape', scrapeRouter.router);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
