package winservice

import "testing"

func TestOutsideTheServiceManagerTheCollectorIsNoService(t *testing.T) {
	if IsService() {
		t.Fatal("a test process reported itself as a Windows service")
	}
	if DisplayName("") != "Skylark collector" || DisplayName("Isles") != "Skylark collector (Isles)" {
		t.Fatalf("display names %q %q", DisplayName(""), DisplayName("Isles"))
	}
}
