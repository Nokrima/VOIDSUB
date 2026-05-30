from unittest.mock import patch, MagicMock
from core.bridge import BridgeServer
from core.capture import ScreenCapturer


def test_bridge_normalize_region():
    bridge = BridgeServer(worker=MagicMock())

    def mock_get_system_metrics(n):
        return {76: 0, 77: 0, 78: 1920, 79: 1080}.get(n, 0)

    with patch(
        "ctypes.windll.user32.GetSystemMetrics", side_effect=mock_get_system_metrics
    ):
        # Test normal region
        res = bridge._normalize_region(
            {"left": 100, "top": 100, "width": 500, "height": 300}
        )
        assert res == {"left": 100, "top": 100, "width": 500, "height": 300}

        # Test out of bounds
        res2 = bridge._normalize_region(
            {"left": -50, "top": -50, "width": 3000, "height": 2000}
        )
        assert res2 is not None
        assert res2["left"] == 0
        assert res2["top"] == 0
        assert res2["width"] <= 1920
        assert res2["height"] <= 1080

        # Test invalid region
        assert bridge._normalize_region({"width": -10, "height": 0}) is None
        assert bridge._normalize_region("not_a_dict") is None


def test_capture_resolve_region():
    capturer = ScreenCapturer()

    with patch.object(
        capturer,
        "_virtual_bounds",
        return_value={"left": 0, "top": 0, "width": 1920, "height": 1080},
    ):
        res = capturer.resolve_region(
            {"left": -100, "top": -100, "width": 4000, "height": 3000}
        )
        assert res["left"] == 0
        assert res["top"] == 0
        assert res["width"] <= 1920
        assert res["height"] <= 1080
