"""JunkFilter yeni katmanlı sistem test."""
from core.processor.junk_filter import JunkFilter

# Test örnekleri
test_cases = [
    # Tip 1 (tamamen çöp) — hard reject bekleniyor
    ("rj;-jrrjer-l fmeone", "Tip1_hard_reject"),
    ("zjrjc] tell thern", "Tip1_hard_reject"),
    ("D'MNJ'\\ IVF '4 IMO", "Tip1_hard_reject"),
    
    # Tip 2 (yarı kirli) — accept bekleniyor
    ("DANA MERCER : No, but they're watching someone for him. OK, it'stthisdoctor", "Tip2_accept"),
    ("No, but they're watching someone", "Tip2_accept"),
    
    # Tip 3 (kısa kopuk parça) — context'e bağlı
    ("abeth Gre", "Tip3_unrecognized_short_reject"),
    ("Elizabe", "Tip3_unrecognized_short_reject"),
    ("Idaho. w", "Tip3_unrecognized_short_reject"),
    
    # Temiz kısa metinler — accept
    ("Go", "clean_short_accept"),
    ("No", "clean_short_accept"),
    ("YES", "clean_short_accept"),
    
    # Tip 3 ama tanınan kelime var — şüpheli ama accept
    ("the cat", "Tip3_with_recognized_accept"),
    ("is here", "Tip3_with_recognized_accept"),
]

print("=" * 70)
print("JunkFilter Katmanlı Sistem Test")
print("=" * 70)

for text, expected_behavior in test_cases:
    is_junk = JunkFilter.is_junk(text)
    alpha = JunkFilter._calculate_alpha_ratio(text)
    recognized = JunkFilter._find_recognized_words(text)
    
    status = "REJECT" if is_junk else "ACCEPT"
    print(f"\n📝 Test: {text!r}")
    print(f"   Alpha Oranı: {alpha:.1%} | Tanınan: {recognized} | {status}")
    print(f"   Beklenen: {expected_behavior}")
    
    # Hızlı doğrulama
    if "reject" in expected_behavior.lower() and is_junk:
        print(f"   ✅ PASS")
    elif "accept" in expected_behavior.lower() and not is_junk:
        print(f"   ✅ PASS")
    else:
        print(f"   ⚠️  MISMATCH")

print("\n" + "=" * 70)
