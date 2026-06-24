Imports Collections

Enum Color
   Vermelho
   Azul
   Verde
   clMinhaCor = 100
End Enum

Dim _colors[] As Color = [Color.Vermelho, Color.Azul, Color.Verde]
print _colors.ToString()

' Dim _opts As String = _colors.Map(pColor As Color => pColor.AsString)
' print _opts
' print _colors.map((pColor As Color, pIdx As Integer) => pIdx.ToString() + ": " + pColor.AsString)

' _colors.ForEach((pColor As Color, pIdx As Integer) => print(pColor.AsString + " " + pIdx.ToString()))

' _colors.ForEach(Helper.ForEachDelegate)

' print Color.Azul.ToString()

' print Color.Azul

' Class Helper
'    Shared Sub ForEachDelegate(pValue As Color, i As Integer, extra As Variant)
'       print(pValue.AsString + " " + i.ToString() + " - Delegate")
'    End Sub
' End Class

Dim count As Integer = 10,  j As Integer
Dim _list As StringList = New StringList(), i As Integer
Dim teste As String
_list.Add("teste")
For i = 0 To count - 1
   print i
Next

Dim _listColor As TTList<Color> = New TTList<Color>()

