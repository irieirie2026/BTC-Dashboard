from pathlib import Path

exec(
    (Path(__file__).parent / "_handler.py").read_text(),
    globals(),
)