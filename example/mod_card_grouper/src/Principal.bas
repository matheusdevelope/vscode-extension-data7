
Imports mod_card_form
Imports Collections

Dim _form As New TFormCard("Processar retorno de cartões 3")

_form.Show()

_form.Free()


Dim status As String = 1 > 0 ? "positivo" : "negativo"
Print status

Dim list As StringList
For Each item As String In list
   ' iterate strings
Next

For Each item In list
   ' "item" é inferido como String porque Strings(i) retorna String
Next

Dim outer As StringList
Dim inner As StringList
For Each name As String In outer
   For Each tag As String In inner
      ' acessa name e tag
   Next
Next

Enum Color
Red = 1;
Green = 2;
Blue = 3;
End Enum

Sub TestEnum()
   Dim c As Color
   c = Color.Red
End Sub
