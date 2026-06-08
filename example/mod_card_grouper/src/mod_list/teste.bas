Imports mod_tlist


Dim _listq As TTList<Integer> = New TTList<Integer>()

_listq.Add(123)
_listq.Add(456)
_listq.Add(789)
print _listq.Count
print _listq.ToString()

Dim prods As TTList<Produto> = New TTList<Produto>()
print prods.Count