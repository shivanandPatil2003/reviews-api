import os
import asyncio
from flask import Flask, request, jsonify
from playwright.async_api import async_playwright
from dotenv import load_dotenv
import openai

# Load environment variables from .env file
load_dotenv()

# Initialize OpenAI API key
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY:
    openai.api_key = OPENAI_API_KEY

# Flask app initialization
app = Flask(__name__)

@app.route('/api/reviews', methods=['GET'])
def get_reviews():
    # Extract URL from query parameter
    url = request.args.get('page')
    if not url:
        return jsonify({"error": "The 'page' query parameter is required!"}), 400
    
    # Run scraping logic asynchronously
    reviews_data = asyncio.run(scrape_reviews(url))
    return jsonify(reviews_data)

async def scrape_reviews(url):
    """
    Scrapes reviews from a given product page URL.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Navigate to the target URL
        await page.goto(url, wait_until='domcontentloaded')

        # Dynamic CSS Selector Identification (Optional: Using OpenAI)
        if OPENAI_API_KEY:
            css_selector = await identify_dynamic_css(page.content())
        else:
            # Default selector example
            css_selector = ".review"  # Replace with an actual example from the page
        
        reviews = []
        try:
            # Extract reviews from the page
            review_elements = await page.query_selector_all(css_selector)
            for element in review_elements:
                title = await element.query_selector(".review-title")
                body = await element.query_selector(".review-body")
                rating = await element.query_selector(".review-rating")
                reviewer = await element.query_selector(".review-author")
                
                reviews.append({
                    "title": await title.inner_text() if title else "No Title",
                    "body": await body.inner_text() if body else "No Body",
                    "rating": int(await rating.inner_text()) if rating else None,
                    "reviewer": await reviewer.inner_text() if reviewer else "Anonymous"
                })

            # Handle pagination
            next_button = await page.query_selector(".pagination-next")
            while next_button:
                await next_button.click()
                await page.wait_for_load_state('domcontentloaded')

                review_elements = await page.query_selector_all(css_selector)
                for element in review_elements:
                    title = await element.query_selector(".review-title")
                    body = await element.query_selector(".review-body")
                    rating = await element.query_selector(".review-rating")
                    reviewer = await element.query_selector(".review-author")

                    reviews.append({
                        "title": await title.inner_text() if title else "No Title",
                        "body": await body.inner_text() if body else "No Body",
                        "rating": int(await rating.inner_text()) if rating else None,
                        "reviewer": await reviewer.inner_text() if reviewer else "Anonymous"
                    })

                next_button = await page.query_selector(".pagination-next")
        except Exception as e:
            print(f"Error: {e}")
        finally:
            await browser.close()

        return {"reviews_count": len(reviews), "reviews": reviews}

async def identify_dynamic_css(html_content):
    """
    Identifies the dynamic CSS selector for reviews using OpenAI API.
    """
    prompt = f"Identify the CSS selector for extracting reviews from the following HTML: {html_content[:1000]}"
    response = openai.Completion.create(
        engine="text-davinci-003",
        prompt=prompt,
        max_tokens=50
    )
    return response["choices"][0]["text"].strip()

# Run the Flask app
if __name__ == '__main__':
    app.run(debug=True, port=3000)
