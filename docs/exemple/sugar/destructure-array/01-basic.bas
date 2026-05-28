' @example: sugar/destructure-array/01-basic
' @demonstrates: Dim [first, second] = lista expandido para Dims com Item(i)
' @diagnostics: none
' @transpiled-to: sugar/destructure-array/_expected/01-basic.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(lista As CardRecordList)
         Dim [first, second] = lista
         Print first.ToString() & " " & second.ToString()
      End Sub
   End Class
End Namespace
