' @example: sugar/for-each-kv/01-basic
' @demonstrates: convenção atual para iterar pares Nome=Valor de uma StringList
' @diagnostics: none
'
' Hoje a iteração de pares chave-valor sobre uma StringList configurada
' como Nome=Valor é manual (For + .Names(i) + .ValueFromIndex(i)). O
' açúcar `For Each (k, v) In dict` ainda é planejado.
'
Imports Collections

Namespace mod_demo
   Class TDemo
      Public Sub Run(dict As StringList)
         Dim i As Integer
         For i = 0 To dict.Count - 1
            Dim k As String = dict.Names(i)
            Dim v As String = dict.ValueFromIndex(i)
            Print k & " = " & v
         Next
      End Sub
   End Class
End Namespace
