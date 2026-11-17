package gitlog

import (
	"reflect"
	"testing"
)

func TestParseRefs(t *testing.T) {
	cases := []struct {
		message       string
		refs, closing []int64
	}{
		{"Add the parser #12", []int64{12}, []int64{}},
		{"closes #12", []int64{12}, []int64{12}},
		{"Fixed #7, refs #8 and done #9", []int64{7, 8, 9}, []int64{7, 9}},
		{"Resolve: #4\n\nFinishes #5. Also touches #4 again.", []int64{4, 5}, []int64{4, 5}},
		{"(#3) wrap", []int64{3}, []int64{}},
		{"#1 first thing", []int64{1}, []int64{}},
		// Not task references: colours, anchors, entities, zero, words glued to the number.
		{"colour #123abc, link page#12, &#39; and #0", []int64{}, []int64{}},
		{"undone #6", []int64{6}, []int64{}},
		{"nothing here", []int64{}, []int64{}},
	}
	for _, c := range cases {
		refs, closing := ParseRefs(c.message)
		if !reflect.DeepEqual(refs, c.refs) || !reflect.DeepEqual(closing, c.closing) {
			t.Errorf("ParseRefs(%q) = %v, %v; want %v, %v", c.message, refs, closing, c.refs, c.closing)
		}
	}
}
