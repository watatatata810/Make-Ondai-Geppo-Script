import os
import glob
import pandas as pd
import re
import argparse
from google import genai
from dotenv import load_dotenv

def load_config():
    """Load configuration and setup Client."""
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not found in .env or environment variables.")
        api_key = input("Please enter your Gemini API key: ").strip()
    
    if not api_key:
        raise ValueError("API key is required to proceed.")
    
    return genai.Client(api_key=api_key)

def extract_excel_data(file_path):
    """Extract all sheets from an Excel file and convert to a text format."""
    print(f"Extracting data from: {file_path}")
    xl = pd.ExcelFile(file_path)
    combined_text = []
    
    for sheet_name in xl.sheet_names:
        df = pd.read_excel(file_path, sheet_name=sheet_name)
        sheet_text = df.fillna("").to_csv(index=False)
        combined_text.append(f"--- SHEET: {sheet_name} ---\n{sheet_text}\n")
    
    return "\n".join(combined_text)

def generate_report(client, prompt_template, excel_data, campus_name):
    """Call Gemini API using google-genai SDK to generate the report."""
    full_prompt = f"{prompt_template}\n\n### DATA FROM EXCEL ({campus_name})\n{excel_data}"
    
    print(f"Calling Gemini API (gemini-2.0-flash) for {campus_name}...")
    try:
        # Use gemini-2.0-flash for speed and free tier support
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=full_prompt
        )
        return response.text
    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description="Generate monthly reports using Gemini API.")
    parser.add_argument("--dry-run", action="store_true", help="Format the prompt and show size without calling API.")
    args = parser.parse_args()

    # 1. Setup API
    client = None
    if not args.dry_run:
        try:
            client = load_config()
        except Exception as e:
            print(e)
            return

    # 2. Read Prompt.md
    prompt_path = "Prompt.md"
    if not os.path.exists(prompt_path):
        print(f"Error: {prompt_path} not found.")
        return
        
    with open(prompt_path, "r", encoding="utf-8") as f:
        prompt_template = f.read()

    # 3. Find Excel files
    excel_files = glob.glob("*.xlsx")
    if not excel_files:
        print("No Excel files (*.xlsx) found in the current directory.")
        return

    for file_path in excel_files:
        # Determine campus name from filename
        campus_name = "池袋キャンパス" if "池袋" in file_path else "中目黒キャンパス" if "中目黒" in file_path else "不明なキャンパス"
        
        # 4. Extract data
        excel_data = extract_excel_data(file_path)
        
        # 5. Generate report
        if args.dry_run:
            prompt_size = len(prompt_template) + len(excel_data)
            print(f"[DRY RUN] Prompt size for {campus_name}: {prompt_size} characters.")
            print(f"[DRY RUN] Would call Gemini API for: {file_path}")
            continue

        report_content = generate_report(client, prompt_template, excel_data, campus_name)
        
        if report_content:
            # Determine output filename
            match = re.search(r"【(\d{4}年\d{2}月)】", file_path)
            period = match.group(1) if match else "月報"
            
            output_filename = f"{period}度_ホール業務月報_{campus_name}.md"
            with open(output_filename, "w", encoding="utf-8") as f:
                f.write(report_content)
            print(f"Successfully generated: {output_filename}")

if __name__ == "__main__":
    main()
