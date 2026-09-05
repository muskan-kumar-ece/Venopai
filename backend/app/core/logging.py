import logging
import sys

def setup_logging():
    # Setup structured logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    logger = logging.getLogger("venopai")
    logger.setLevel(logging.INFO)
    return logger

logger = setup_logging()
