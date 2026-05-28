' @example: sugar/destructure-array/02-rest
' @demonstrates: Dim [first, ...rest] = lista expandido com loop For
' @diagnostics: none
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(lista As CardRecordList)
         Dim [first, ...rest] = lista
         Print first.ToString()
      End Sub
   End Class
End Namespace
