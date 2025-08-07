# Amazon Product Scraper API

A lightweight Node.js API that scrapes product search results from Amazon based on a given keyword. Built with Express, Axios, and jsdom. Includes basic security and rate-limiting protections.

## 🔧 Features

- Keyword-based search on Amazon
- HTML parsing via jsdom
- Extracts title, link, image, and rating of products
- Built-in security: CORS, Helmet, Rate Limiting
- Clean and modular structure (URL Builder, HTTP Client, Parser)

---

## 📦 Technologies Used

- Node.js
- Express
- Axios
- jsdom
- Helmet (Security)
- CORS (Cross-Origin Resource Sharing)
- express-rate-limit (Throttling)

---

## 📁 Project Structure

```
.
├── index.js           # Entry point and Express setup
├── package.json
└── ...
```

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/amazon-scraper.git
cd amazon-scraper
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run the server

```bash
node index.js
```

Server will run on:

```
http://localhost:3000
```

You can change the port using the `PORT` environment variable.

---

## 🔍 Usage

### Endpoint

```
GET /search/:keyword
```

**Example:**

```
GET /search/usb charger
```

### Response

Returns a JSON array with the following fields for each product:

```json
[
  {
    "title": "Anker USB-C Charger...",
    "link": "https://www.amazon.com/...",
    "image": "https://m.media-amazon.com/...",
    "rating": 4.7
  },
  ...
]
```

---

## 🔒 Security Features

- **Helmet:** Sets secure HTTP headers
- **CORS:** Allows cross-origin requests
- **Rate Limiting:** Prevents abuse (100 requests per 15 minutes per IP)
- **Input Validation:** Only allows alphanumeric, spaces, and dashes in keywords (max 50 chars)

---

## ⚠️ Limitations

- Amazon may block frequent requests or show CAPTCHA
- HTML structure changes can break the parser
- Not suitable for large-scale crawling (no proxy rotation or headless browser)

---

## 📄 License

This project is open-source under the MIT License.

---

## 🤝 Contributions

Feel free to open issues or pull requests. Bug reports and improvements are welcome!
