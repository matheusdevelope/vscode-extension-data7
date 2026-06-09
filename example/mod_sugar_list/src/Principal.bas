Imports mod_tlist
Imports mod_product

Dim _names[] As String = [
   "Produto 1",
   "Produto 2",
   "Produto 3"
]

Dim _prods[] As Product = [
   New Product(0, "Manual"),
   ..._names.map((pName As String, pIndex As Integer) => New Product(pIndex + 1, pName))
]

_prods.forEach((p As Product) => print(p.ToString()))

Dim _last As Product = _prods.Pop()
print _last.ToString()

print _prods.ToString()
