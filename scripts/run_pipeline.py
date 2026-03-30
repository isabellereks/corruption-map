#!/usr/bin/env python3
"""Orchestrator: runs the data pipeline steps 01–07 in order."""

import argparse
import sys
import time
from pathlib import Path

# Add scripts/ to path so pipeline package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv

from pipeline.utils import is_step_complete, mark_step_complete, read_progress

PROGRESS_PATH = Path(__file__).resolve().parent / ".progress.json"

STEPS = [
    ("01_load_fec", "pipeline.01_load_fec"),
    ("02_load_opensecrets", "pipeline.02_load_opensecrets"),
    ("03_load_voteview", "pipeline.03_load_voteview"),
    ("04_load_dime", "pipeline.04_load_dime"),
    ("05_load_openlobby", "pipeline.05_load_openlobby"),
    ("06_score_votes", "pipeline.06_score_votes"),
    ("07_merge", "pipeline.07_merge"),
]


def import_step(module_path):
    """Dynamically import a step module."""
    import importlib
    return importlib.import_module(module_path)


def main():
    parser = argparse.ArgumentParser(description="Run the corruption-map data pipeline")
    parser.add_argument("--force", "-f", action="store_true", help="Re-run all steps, ignoring progress")
    parser.add_argument("--step", type=int, help="Run only this step number (1-7)")
    parser.add_argument("--from-step", type=int, help="Run from this step number onward")
    args = parser.parse_args()

    # Load .env for ANTHROPIC_API_KEY
    env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(env_path)

    progress = read_progress(PROGRESS_PATH)

    # Determine which steps to run
    steps_to_run = STEPS
    if args.step:
        steps_to_run = [(name, mod) for name, mod in STEPS if name.startswith(f"{args.step:02d}_")]
        if not steps_to_run:
            print(f"Error: no step {args.step} found")
            sys.exit(1)
    elif args.from_step:
        steps_to_run = [(name, mod) for name, mod in STEPS if int(name[:2]) >= args.from_step]

    print("=" * 60)
    print("CORRUPTION MAP DATA PIPELINE")
    print("=" * 60)

    total_start = time.time()
    results = {}

    for step_name, module_path in steps_to_run:
        step_num = step_name[:2]

        # Check progress
        if not args.force and is_step_complete(progress, step_name):
            print(f"\n[{step_num}/07] {step_name} — SKIPPED (already complete)")
            continue

        print(f"\n[{step_num}/07] {step_name}")
        print("-" * 40)

        step_start = time.time()
        try:
            module = import_step(module_path)
            result = module.run()
            elapsed = time.time() - step_start

            mark_step_complete(PROGRESS_PATH, step_name)
            results[step_name] = result
            print(f"  Completed in {elapsed:.1f}s")
            if result and "record_count" in result:
                print(f"  Records: {result['record_count']}")

        except FileNotFoundError as e:
            print(f"\n  ERROR: {e}")
            print("  Pipeline stopped. Fix the issue and re-run.")
            sys.exit(1)
        except Exception as e:
            print(f"\n  ERROR in {step_name}: {e}")
            import traceback
            traceback.print_exc()
            print("\n  Pipeline stopped. Fix the issue and re-run.")
            sys.exit(1)

    total_elapsed = time.time() - total_start
    print("\n" + "=" * 60)
    print(f"PIPELINE COMPLETE — {total_elapsed:.1f}s total")
    print("=" * 60)

    # Print summary
    for step_name, result in results.items():
        count = result.get("record_count", "?") if result else "?"
        print(f"  {step_name}: {count} records")


if __name__ == "__main__":
    main()
