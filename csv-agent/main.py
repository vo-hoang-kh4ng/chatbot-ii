import base64
import io
import os
from typing import Optional

import pandas as pd
import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.responses import JSONResponse
from dotenv import load_dotenv

# LangChain imports
from langchain_openai import ChatOpenAI
try:
    from langchain_experimental.agents import create_pandas_dataframe_agent  # type: ignore
except Exception as e:
    create_pandas_dataframe_agent = None  # type: ignore

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

load_dotenv()

app = FastAPI(title="CSV Agent Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskJson(BaseModel):
    csv_url: Optional[str] = None
    csv_text: Optional[str] = None
    question: str


def fetch_csv_text(csv_url: str) -> str:
    try:
        r = requests.get(csv_url, timeout=30)
        r.raise_for_status()
        return r.text
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch CSV: {e}")


def load_df(csv_text: str) -> pd.DataFrame:
    try:
        df = pd.read_csv(io.StringIO(csv_text))
        return df
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")


def run_agent(df: pd.DataFrame, question: str):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Missing OPENAI_API_KEY")

    if create_pandas_dataframe_agent is None:
        raise HTTPException(status_code=500, detail="langchain_experimental not available. Install langchain-experimental.")

    llm = ChatOpenAI(api_key=api_key, model="gpt-4o-mini", temperature=0)

    # Clear previous figures
    plt.close('all')

    agent = create_pandas_dataframe_agent(
        llm,
        df,
        verbose=False,
        allow_dangerous_code=True,
        include_df_in_prompt=True,
        # Handle parsing errors gracefully so the agent can retry or pass raw output
        agent_executor_kwargs={
            "handle_parsing_errors": True,
        },
    )

    try:
        answer = agent.run(question)
    except Exception as e:
        # Ensure figures are cleared on error
        plt.close('all')
        raise HTTPException(status_code=500, detail=f"Agent error: {e}")

    # Capture last figure if any
    image_b64 = None
    if plt.get_fignums():
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight')
        buf.seek(0)
        image_b64 = base64.b64encode(buf.read()).decode('utf-8')
        buf.close()
    # Close figures
    plt.close('all')

    return answer, image_b64


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ask")
async def ask(
    question: str = Form(None),
    csv_url: Optional[str] = Form(None),
    csv_text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    text: Optional[str] = None

    if csv_url:
        text = fetch_csv_text(csv_url)
    elif csv_text:
        text = csv_text
    elif file is not None:
        try:
            content = await file.read()
            if content is None:
                raise ValueError("Empty file")
            text = content.decode("utf-8", errors="ignore")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")
    else:
        raise HTTPException(status_code=400, detail="Provide csv_url, csv_text, or file")

    df = load_df(text)
    answer, image_b64 = run_agent(df, question)
    return JSONResponse({"answer": answer, "image_base64": image_b64})


# JSON body variant
@app.post("/ask_json")
async def ask_json(body: AskJson):
    if not body.question:
        raise HTTPException(status_code=400, detail="question is required")
    if body.csv_url:
        text = fetch_csv_text(body.csv_url)
    elif body.csv_text:
        text = body.csv_text
    else:
        raise HTTPException(status_code=400, detail="Provide csv_url or csv_text")

    df = load_df(text)
    answer, image_b64 = run_agent(df, body.question)
    return JSONResponse({"answer": answer, "image_base64": image_b64})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
