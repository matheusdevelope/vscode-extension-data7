' @example: sugar/enum-declarative/_expected/01-basic
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/enum-declarative/01-basic
' @diagnostics: none
'
Imports mod_enum
Imports mod_tenum
Namespace mod_demo
   Class CardAdm
      Inherits TEnum
      Private Shared Sub Initialize()
         If TEnum._IsCached("CardAdm", "Stone") Then Exit Sub
         TEnum._AddEnumItem("CardAdm", New CardAdm(0, "Stone"))
         TEnum._AddEnumItem("CardAdm", New CardAdm(1, "Cielo"))
      End Sub
      Shared Function Stone As CardAdm
         Stone = Load("Stone")
      End Function
      Shared Function Cielo As CardAdm
         Cielo = Load("Cielo")
      End Function
      Shared Function Load(pValue As CardAdm) As CardAdm
         Load = Load(pValue.AsString)
      End Function
      Shared Function Load(pValue As Integer) As CardAdm
         CardAdm.Initialize()
         Load = CardAdm(TEnum._GetCache("CardAdm", pValue))
      End Function
      Shared Function Load(pValue As String) As CardAdm
         CardAdm.Initialize()
         Load = CardAdm(TEnum._GetCache("CardAdm", pValue))
      End Function
      Shared Function GetOptions() As String
         CardAdm.Initialize()
         GetOptions = TEnum._GetEnumOptions("CardAdm")
      End Function
   End Class
End Namespace
