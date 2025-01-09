// Import required libraries
const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Endpoint to fetch reviews
app.get('/api/reviews', async (req, res) => {
  const productUrl = req.query.page;

  // Validate the input URL
  if (!productUrl) {
    return res.status(400).json({ error: 'Product page URL is required.' });
  }

  try {
    console.log(`[INFO] Launching Puppeteer for URL: ${productUrl}`);
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Navigate to the product page
    await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
    console.log('[INFO] Page loaded successfully.');

    // Use OpenAI or a placeholder to identify review selectors
    const dynamicSelector = await identifyReviewSelector(productUrl);
    console.log(`[DEBUG] Identified selector: ${JSON.stringify(dynamicSelector)}`);

    const reviewsData = [];
    let currentPage = 1;

    // Pagination handling
    while (true) {
      console.log(`[INFO] Scraping reviews from page ${currentPage}`);
      const reviews = await page.evaluate((selector) => {
        const reviewElements = document.querySelectorAll(selector.reviewContainer);
        const data = [];

        reviewElements.forEach((element) => {
          const title = element.querySelector(selector.title)?.innerText || 'No title';
          const body = element.querySelector(selector.body)?.innerText || 'No body text';
          const rating = element.querySelector(selector.rating)?.innerText || 'No rating';
          const reviewer = element.querySelector(selector.reviewer)?.innerText || 'Anonymous';
          data.push({ title, body, rating, reviewer });
        });

        return data;
      }, dynamicSelector);

      reviewsData.push(...reviews);

      // Check if there's a next page
      const nextButton = await page.$(dynamicSelector.nextPage);
      if (!nextButton) {
        console.log('[INFO] No more pages to scrape.');
        break;
      }

      console.log('[INFO] Navigating to the next page.');
      await nextButton.click();
      await page.waitForTimeout(3000); // Wait for content to load
      currentPage++;
    }

    // Close the browser
    await browser.close();
    console.log('[INFO] Browser closed.');

    // Respond with reviews data
    return res.json({
      reviews_count: reviewsData.length,
      reviews: reviewsData,
    });
  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ error: 'Failed to fetch reviews. Check server logs for more details.' });
  }
});

// Helper function to identify CSS selectors dynamically
async function identifyReviewSelector(url) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('[WARN] OPENAI_API_KEY is not configured. Returning dummy selectors.');
    return {
      reviewContainer: '.review',
      title: '.review-title',
      body: '.review-body',
      rating: '.review-rating',
      reviewer: '.review-author',
      nextPage: '.next-page',
    };
  }

  console.log(`[INFO] Using OpenAI API to identify CSS selectors for URL: ${url}`);
  const response = await axios.post(
    'https://api.openai.com/v1/completions',
    {
      model: 'gpt-4',
      prompt: `Identify CSS selectors for reviews on the product page: ${url}`,
      max_tokens: 100,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const selectors = response.data.choices[0]?.text?.trim();
  return JSON.parse(selectors);
}

// Start the server
app.listen(PORT, () => {
  console.log(`[INFO] Server is running on http://localhost:${PORT}`);
});
